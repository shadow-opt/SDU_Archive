import { useCallback, useEffect, useRef, useState } from 'react';
import { apiBase, getAuthToken, clearAuthToken } from '../services/api';

interface Citation {
  source: string;
  snippet: string;
  document_title?: string;
}

export default function Home() {
  const HISTORY_WINDOW = 4;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [status, setStatus] = useState('');
  const [isAnswerExpanded, setIsAnswerExpanded] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setToken(getAuthToken());
  }, []);

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
    setAnswer('');
    setCitations([]);
    setStatus('已退出登录');
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setQuery('');
    setAnswer('');
    setCitations([]);
    setStatus('已切换到新对话');
    setIsAnswerExpanded(false);
  };

  // ─── SSE streaming search ───────────────────────────────────────────
  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !token) {
      if (!token) setStatus('请先登录后再进行校史检索');
      return;
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('检索中...');
    setAnswer('');
    setCitations([]);
    setStreaming(true);
    setIsAnswerExpanded(false);

    try {
      const res = await fetch(`${apiBase}/api/rag/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query,
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
              setCitations(payload.citations);
            }
            if (payload.conversation_id) {
              setActiveConversationId(payload.conversation_id);
            }
            if (payload.text) {
              setAnswer((prev) => prev + payload.text);
            }
            if (payload.error) {
              setStatus(payload.error);
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStatus(err instanceof Error ? err.message : '查询失败，请稍后重试');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [activeConversationId, query, token]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-3xl mx-auto text-center">
      <h1 className="text-4xl md:text-5xl font-serif font-bold text-ink-dark mb-6 tracking-tight">
        探索山大历史
      </h1>
      <p className="text-lg text-ink-light mb-12 max-w-xl leading-relaxed">
        输入自然语言，AI 将为您在海量校史档案中寻找答案，并提供详实的文献出处。
      </p>

      {!token ? (
        <div className="w-full max-w-xl bg-white border border-ink-dark/10 rounded-2xl p-6 md:p-8 text-left mb-10">
          <h2 className="text-xl font-serif font-bold text-ink-dark mb-2">登录后检索</h2>
          <p className="text-sm text-ink-light mb-6">为保证档案服务安全，查询功能仅对已登录用户开放。</p>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm text-ink-dark mb-1">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:outline-none focus:ring-2 focus:ring-sdu-red/40"
                placeholder="you@sdu.edu.cn"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-ink-dark mb-1">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:outline-none focus:ring-2 focus:ring-sdu-red/40"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-sdu-red text-white rounded-lg font-medium hover:bg-sdu-red-hover transition-colors"
            >
              登录并开始检索
            </button>
          </form>
          <p className="mt-4 text-sm text-ink-light">账号由管理员创建，如需开通请联系管理员。</p>
        </div>
      ) : (
        <div className="mb-6 text-sm text-ink-light">
          已登录，可开始检索。
          <button
            type="button"
            onClick={handleNewConversation}
            className="ml-2 text-sdu-red hover:underline"
            disabled={streaming}
          >
            新对话
          </button>
          <button type="button" onClick={handleLogout} className="ml-2 text-sdu-red hover:underline">
            退出登录
          </button>
        </div>
      )}

      <form onSubmit={handleSearch} className="w-full relative mb-16">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例如：山东大学是哪一年建校的？"
          className="w-full px-6 py-4 text-lg rounded-full border border-ink-dark/20 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-sdu-red/50 focus:border-sdu-red transition-all pr-32 disabled:bg-gray-100 disabled:cursor-not-allowed"
          disabled={!token}
        />
        <button
          type="submit"
          disabled={!token || !query.trim() || streaming}
          className="absolute right-2 top-2 bottom-2 px-6 bg-sdu-red text-white rounded-full font-medium hover:bg-sdu-red-hover disabled:opacity-50 transition-colors"
        >
          {streaming ? '生成中…' : '搜索'}
        </button>
      </form>

      {status && status !== '检索中...' && (
        <div className="text-sdu-red mb-8">{status}</div>
      )}

      {(answer || streaming) && (
        <div className="w-full text-left bg-white p-4 md:p-8 rounded-2xl shadow-sm border border-ink-dark/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h3 className="text-xl font-serif font-bold mb-4 text-ink-dark">AI 回答</h3>
          <div className="prose prose-stone max-w-none mb-8 text-ink-dark/80 leading-relaxed whitespace-pre-wrap">
            <div className={`${!isAnswerExpanded && answer.length > 500 ? 'line-clamp-6 md:line-clamp-none' : ''}`}>
              {answer}
              {streaming && <span className="inline-block w-2 h-4 bg-sdu-red/60 animate-pulse ml-0.5 align-text-bottom" />}
            </div>
            {!isAnswerExpanded && answer.length > 500 && (
              <button
                type="button"
                onClick={() => setIsAnswerExpanded(true)}
                className="mt-2 text-sdu-red hover:underline text-sm md:hidden"
              >
                展开全文 ▼
              </button>
            )}
            {isAnswerExpanded && answer.length > 500 && (
              <button
                type="button"
                onClick={() => setIsAnswerExpanded(false)}
                className="mt-2 text-sdu-red hover:underline text-sm md:hidden"
              >
                收起 ▲
              </button>
            )}
          </div>
          
          {citations.length > 0 && (
            <div className="border-t border-ink-dark/10 pt-6">
              <h4 className="text-sm font-bold text-ink-light uppercase tracking-wider mb-4">引用文献</h4>
              <ul className="space-y-4">
                {citations.map((cit, idx) => (
                  <li key={idx} className="text-sm bg-paper-bg p-4 rounded-lg border border-ink-dark/5">
                    <span className="font-medium text-sdu-red block mb-1">
                      [{idx + 1}] {cit.document_title || cit.source}
                    </span>
                    <span className="text-ink-light line-clamp-3">{cit.snippet}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
