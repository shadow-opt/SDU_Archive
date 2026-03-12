import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiBase, getAuthToken, clearAuthToken } from '../services/api';

interface Citation {
  source: string;
  snippet: string;
  document_title?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  streaming?: boolean;
  error?: string;
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose prose-stone max-w-none prose-headings:font-serif prose-headings:text-ink-dark prose-p:text-ink-dark prose-strong:text-ink-dark prose-li:text-ink-dark prose-code:text-ink-dark prose-pre:bg-ink-dark prose-pre:text-white">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer" className="text-sdu-red hover:underline" />,
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            return isInline ? (
              <code {...props} className="rounded bg-sdu-red-light px-1.5 py-0.5 text-[0.9em] text-sdu-red">
                {children}
              </code>
            ) : (
              <code {...props} className={className}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function Home() {
  const HISTORY_WINDOW = 4;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setToken(getAuthToken());
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streaming]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('登录中...');

    try {
      const form = new FormData();
      form.append('username', email);
      form.append('password', password);

      const loginRes = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        body: form,
      });
      if (!loginRes.ok) {
        const err = await loginRes.json().catch(() => ({}));
        throw new Error(err.detail || '登录失败');
      }

      const data = await loginRes.json();
      localStorage.setItem('token', data.access_token);
      setToken(data.access_token);
      setStatus('登录成功，现在可以检索了');
      setEmail('');
      setPassword('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '认证失败');
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    setToken(null);
    setActiveConversationId(null);
    setMessages([]);
    setStatus('已退出登录');
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setQuery('');
    setMessages([]);
    setStatus('已切换到新对话');
  };

  // ─── SSE streaming search ───────────────────────────────────────────
  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const userQuery = query.trim();
    if (!userQuery || !token) {
      if (!token) setStatus('请先登录后再进行校史检索');
      return;
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMessageId = `${Date.now()}-user`;
    const assistantMessageId = `${Date.now()}-assistant`;

    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: 'user', content: userQuery },
      { id: assistantMessageId, role: 'assistant', content: '', citations: [], streaming: true },
    ]);
    setQuery('');

    setStatus('检索中...');
    setStreaming(true);
    const updateAssistant = (updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === assistantMessageId ? updater(msg) : msg)),
      );
    };

    try {
      const res = await fetch(`${apiBase}/api/rag/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: userQuery,
          conversation_id: activeConversationId,
          history_window: HISTORY_WINDOW,
        }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        clearAuthToken();
        setToken(null);
        throw new Error('登录已过期，请重新登录');
      }
      if (!res.ok) throw new Error('查询失败');

      const reader = res.body?.getReader();
      if (!reader) throw new Error('浏览器不支持流式读取');

      const decoder = new TextDecoder();
      let buf = '';

      setStatus('');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.citations) {
              updateAssistant((msg) => ({ ...msg, citations: payload.citations }));
            }
            if (payload.conversation_id) {
              setActiveConversationId(payload.conversation_id);
            }
            if (payload.text) {
              updateAssistant((msg) => ({ ...msg, content: msg.content + payload.text }));
            }
            if (payload.error) {
              setStatus(payload.error);
              updateAssistant((msg) => ({ ...msg, error: payload.error, streaming: false }));
            }
            if (payload.done) {
              updateAssistant((msg) => ({ ...msg, streaming: false }));
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const errorMessage = err instanceof Error ? err.message : '查询失败，请稍后重试';
        setStatus(errorMessage);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, error: errorMessage, streaming: false } : msg,
          ),
        );
      }
    } finally {
      setStreaming(false);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId ? { ...msg, streaming: false } : msg,
        ),
      );
      abortRef.current = null;
    }
  }, [activeConversationId, query, token]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <section className="mb-8 rounded-3xl border border-ink-dark/10 bg-white/90 px-6 py-8 shadow-sm md:px-10">
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-ink-dark tracking-tight">山大校史 AI 问答</h1>
        <p className="mt-3 max-w-2xl text-ink-light leading-relaxed">
          通过自然语言提问，系统将基于校史档案进行检索并生成回答，同时给出可追溯的引用文献。
        </p>

        {!token ? (
          <div className="mt-8 rounded-2xl border border-ink-dark/10 bg-paper-bg p-5 md:p-6">
            <h2 className="text-lg font-serif font-bold text-ink-dark">登录后开始问答</h2>
            <p className="mt-1 text-sm text-ink-light">为保障档案服务安全，问答功能仅对已登录用户开放。</p>
            <form onSubmit={handleAuth} className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-ink-dark">
                邮箱
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-ink-dark/20 bg-white px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-sdu-red/30"
                  placeholder="you@sdu.edu.cn"
                  required
                />
              </label>
              <label className="text-sm text-ink-dark">
                密码
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-ink-dark/20 bg-white px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-sdu-red/30"
                  required
                />
              </label>
              <div className="md:col-span-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-ink-light">账号由管理员创建，如需开通请联系管理员。</p>
                <button
                  type="submit"
                  className="rounded-lg bg-sdu-red px-5 py-2.5 text-sm font-medium text-white hover:bg-sdu-red-hover transition-colors"
                >
                  登录并开始检索
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-light">
            <span>已登录，可进行多轮提问。</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleNewConversation}
                disabled={streaming}
                className="rounded-md border border-ink-dark/20 px-3 py-1.5 text-ink-dark hover:border-sdu-red hover:text-sdu-red disabled:cursor-not-allowed disabled:opacity-60"
              >
                新对话
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md border border-ink-dark/20 px-3 py-1.5 text-ink-dark hover:border-sdu-red hover:text-sdu-red"
              >
                退出登录
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-ink-dark/10 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-ink-dark/10 px-5 py-4 md:px-6">
          <h3 className="font-serif text-xl font-bold text-ink-dark">当前对话</h3>
          <p className="mt-1 text-sm text-ink-light">支持连续追问，回答将以 Markdown 格式展示。</p>
        </div>

        <div className="max-h-[62vh] overflow-y-auto bg-paper-bg/60 px-4 py-5 md:px-6">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-dark/20 bg-white/70 p-6 text-center text-sm text-ink-light">
              暂无对话，试试输入：山东大学是哪一年建校的？
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`w-full max-w-[90%] rounded-2xl px-4 py-3 md:max-w-[82%] ${
                      message.role === 'user'
                        ? 'bg-sdu-red text-white shadow-sm'
                        : 'bg-white border border-ink-dark/10 text-ink-dark shadow-sm'
                    }`}
                  >
                    <p className={`mb-2 text-xs font-medium ${message.role === 'user' ? 'text-white/80' : 'text-ink-light'}`}>
                      {message.role === 'user' ? '你' : 'AI 助手'}
                    </p>

                    {message.role === 'assistant' ? (
                      <>
                        <MarkdownMessage content={message.content || (message.streaming ? '正在生成回答...' : '')} />
                        {message.streaming && (
                          <span className="ml-0.5 inline-block h-4 w-2 animate-pulse align-text-bottom bg-sdu-red/60" />
                        )}
                        {message.error && <p className="mt-3 text-sm text-sdu-red">{message.error}</p>}

                        {message.citations && message.citations.length > 0 && (
                          <div className="mt-4 border-t border-ink-dark/10 pt-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-light">引用文献</p>
                            <ul className="space-y-2">
                              {message.citations.map((cit, idx) => (
                                <li key={`${message.id}-cit-${idx}`} className="rounded-lg border border-ink-dark/10 bg-paper-bg px-3 py-2">
                                  <p className="text-sm font-medium text-sdu-red">[{idx + 1}] {cit.document_title || cit.source}</p>
                                  <p className="mt-0.5 line-clamp-3 text-xs text-ink-light">{cit.snippet}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        <form onSubmit={handleSearch} className="border-t border-ink-dark/10 bg-white px-4 py-4 md:px-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例如：山东大学的历史演变是怎样的？"
              className="flex-1 rounded-xl border border-ink-dark/20 bg-white px-4 py-3 text-ink-dark shadow-sm focus:outline-none focus:ring-2 focus:ring-sdu-red/30 disabled:cursor-not-allowed disabled:bg-gray-100"
              disabled={!token || streaming}
            />
            <button
              type="submit"
              disabled={!token || !query.trim() || streaming}
              className="rounded-xl bg-sdu-red px-6 py-3 font-medium text-white transition-colors hover:bg-sdu-red-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {streaming ? '生成中…' : '发送问题'}
            </button>
          </div>
          {status && <p className="mt-2 text-sm text-sdu-red">{status}</p>}
        </form>
      </section>
    </div>
  );
}
