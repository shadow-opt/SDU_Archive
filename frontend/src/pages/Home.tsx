import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import InlineNotice from '../components/InlineNotice';
import { apiBase, clearAuthToken, getAuthHeaders, getAuthToken, parseApiError } from '../services/api';

interface Citation {
  source: string;
  snippet: string;
  document_title?: string;
  filename?: string;
  year_or_period?: string;
  doc_type?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  streaming?: boolean;
  error?: string;
  degraded?: boolean;
}

type RequestState = 'idle' | 'submitting' | 'streaming' | 'aborted' | 'error';

type Notice = {
  message: string;
  type: 'info' | 'success' | 'error';
};

type StreamPayload = Partial<{
  citations: Citation[];
  conversation_id: string;
  text: string;
  error: string;
  done: boolean;
  degraded: boolean;
}>;

const HISTORY_WINDOW = 4;
const DEFAULT_VISIBLE_CITATIONS = 2;
const QUICK_PROMPTS = [
  '山东大学是哪一年建校的？',
  '山东大学历史上有哪些重要校名变更？',
  '山东大学在抗战时期有哪些办学历程？',
  '请简要介绍山东大学的历史演变。',
];

const isAbortError = (error: unknown) => error instanceof Error && error.name === 'AbortError';

const stripExtension = (value: string) => value.replace(/\.[^.]+$/, '');

const normalizeComparableValue = (value?: string) =>
  stripExtension(value?.split('/').filter(Boolean).pop()?.trim() ?? '')
    .replace(/[_\-\s]+/g, '')
    .toLowerCase();

const looksLikeFileName = (value?: string) => {
  if (!value) return false;
  const trimmed = value.trim();
  return /[\\/]/.test(trimmed) || /\.[a-z0-9]{1,6}$/i.test(trimmed);
};

const looksLikeOpaqueObjectName = (value?: string) => {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f-]{20,}/i.test(value.trim());
};

const hasReadableDocumentTitle = (citation: Citation) => {
  const title = citation.document_title?.trim();
  if (!title) return false;
  if (looksLikeFileName(title) || looksLikeOpaqueObjectName(title)) return false;

  const comparableTitle = normalizeComparableValue(title);
  if (!comparableTitle) return false;

  return comparableTitle !== normalizeComparableValue(citation.filename)
    && comparableTitle !== normalizeComparableValue(citation.source);
};

const getCitationTitle = (citation: Citation, index: number) => {
  if (hasReadableDocumentTitle(citation)) {
    return citation.document_title!.trim();
  }
  return `档案依据 ${index + 1}`;
};

const buildCitationCopyText = (citation: Citation, index: number) => {
  const lines = [`参考依据 ${index + 1}：${getCitationTitle(citation, index)}`, `片段摘要：${citation.snippet}`];

  return lines.join('\n');
};

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose prose-stone max-w-none break-words text-sm prose-headings:font-serif prose-headings:text-ink-dark prose-p:text-ink-dark prose-strong:text-ink-dark prose-li:text-ink-dark prose-code:break-words prose-code:text-ink-dark prose-pre:overflow-x-auto prose-pre:bg-ink-dark prose-pre:text-white prose-table:block prose-table:overflow-x-auto md:text-base">
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

function CitationCard({ citation, index }: { citation: Citation; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildCitationCopyText(citation, index));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <li className="rounded-xl border border-ink-dark/10 bg-paper-bg/70 p-3 shadow-sm sm:rounded-2xl sm:p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sdu-red/10 text-xs font-semibold text-sdu-red">
            {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-ink-dark">{getCitationTitle(citation, index)}</p>
          <p className={`mt-1.5 break-words text-sm leading-6 text-ink-light ${expanded ? '' : 'line-clamp-2'}`}>
              {citation.snippet}
          </p>
        </div>
      </div>

      <div className="mt-3 border-t border-ink-dark/10 pt-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-full border border-ink-dark/10 px-3 py-2 text-sm font-medium text-ink-dark transition-colors hover:border-sdu-red/30 hover:text-sdu-red sm:py-1 sm:text-xs"
          >
            {expanded ? '收起摘要' : '展开摘要'}
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded-full border border-ink-dark/10 px-3 py-2 text-sm font-medium text-ink-dark transition-colors hover:border-sdu-red/30 hover:text-sdu-red sm:py-1 sm:text-xs"
          >
            {copied ? '已复制' : '复制摘录'}
          </button>
        </div>
      </div>
    </li>
  );
}

function CitationList({ citations, degraded }: { citations: Citation[]; degraded?: boolean }) {
  const [showAll, setShowAll] = useState(false);

  if (!citations.length && !degraded) return null;

  const visibleCitations = showAll ? citations : citations.slice(0, DEFAULT_VISIBLE_CITATIONS);

  return (
    <div className="mt-4 space-y-3 border-t border-ink-dark/10 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-light">参考依据</p>
        {citations.length > 0 ? <p className="text-xs text-ink-light">共 {citations.length} 条</p> : null}
      </div>

      {degraded && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          当前回答基于检索片段整理，建议结合原始档案进一步核对。
        </p>
      )}

      {citations.length > 0 ? (
        <>
          <ul className="space-y-2.5">
            {visibleCitations.map((citation, index) => (
              <CitationCard key={`${citation.source}-${index}`} citation={citation} index={index} />
            ))}
          </ul>

          {citations.length > DEFAULT_VISIBLE_CITATIONS && (
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className="inline-flex items-center rounded-full border border-ink-dark/10 px-3 py-1.5 text-xs font-medium text-ink-dark transition-colors hover:border-sdu-red/30 hover:text-sdu-red"
            >
              {showAll ? '收起其余依据' : `查看更多依据（+${citations.length - DEFAULT_VISIBLE_CITATIONS}）`}
            </button>
          )}
        </>
      ) : (
        <p className="text-xs leading-5 text-ink-light">当前回答未返回可展示的引用摘录。</p>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex min-w-0 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`min-w-0 w-full max-w-[96%] rounded-2xl px-3 py-3 sm:max-w-[92%] sm:px-4 md:max-w-[82%] ${
          isUser
            ? 'bg-sdu-red text-white shadow-sm'
            : 'border border-ink-dark/10 bg-white text-ink-dark shadow-sm'
        }`}
      >
        <div className={`mb-2 flex items-center justify-between gap-3 text-xs font-medium ${isUser ? 'text-white/80' : 'text-ink-light'}`}>
          <p>{isUser ? '你' : 'AI 回答'}</p>
          {!isUser && message.streaming ? <p className="text-sdu-red">正在生成…</p> : null}
        </div>

        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6 md:text-base md:leading-7">{message.content}</p>
        ) : (
          <>
            <MarkdownMessage content={message.content || (message.streaming ? '正在生成回答...' : '暂无内容')} />
            {message.streaming && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded bg-sdu-red/60 align-text-bottom" />}
            {message.degraded && (
              <p className="mt-3 text-xs leading-5 text-amber-700">当前回答基于检索片段整理，仅供参考。</p>
            )}
            {message.error && <p className="mt-3 text-sm text-sdu-red">{message.error}</p>}
            <CitationList citations={message.citations ?? []} degraded={message.degraded} />
          </>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const isBusy = requestState === 'submitting' || requestState === 'streaming';
  const canRetry = Boolean(token && lastSubmittedQuery && !isBusy);

  const pageSummary = useMemo(() => {
    if (!token) return '登录后即可提问。';
    if (!messages.length) return '输入问题后即可开始。';
    return activeConversationId ? '当前对话进行中。' : '已准备好开始新对话。';
  }, [activeConversationId, messages.length, token]);

  useEffect(() => {
    setToken(getAuthToken());
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [isBusy, messages]);

  const handleLogout = () => {
    abortRef.current?.abort();
    clearAuthToken();
    setToken(null);
    setActiveConversationId(null);
    setMessages([]);
    setLastSubmittedQuery('');
    setRequestState('idle');
    setNotice({ message: '已退出登录。', type: 'info' });
  };

  const handleNewConversation = () => {
    abortRef.current?.abort();
    setActiveConversationId(null);
    setQuery('');
    setMessages([]);
    setRequestState('idle');
    setNotice({ message: '已切换到新对话。', type: 'info' });
  };

  const handleAbort = useCallback(() => {
    if (!abortRef.current) return;
    abortRef.current.abort();
    setRequestState('aborted');
    setNotice({ message: '已停止生成，可继续追问或重试上一问。', type: 'info' });
  }, []);

  const submitQuery = useCallback(async (rawQuery: string, options?: { clearInput?: boolean }) => {
    const userQuery = rawQuery.trim();
    if (!userQuery || !token) {
      if (!token) {
        setNotice({ message: '请先登录后再进行校史问答。', type: 'info' });
        navigate('/login?next=/', { replace: false });
      }
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const stamp = Date.now();
    const userMessageId = `${stamp}-user`;
    const assistantMessageId = `${stamp}-assistant`;

    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: 'user', content: userQuery },
      { id: assistantMessageId, role: 'assistant', content: '', citations: [], streaming: true },
    ]);
    if (options?.clearInput) {
      setQuery('');
    }
    setLastSubmittedQuery(userQuery);
    setRequestState('submitting');
    setNotice({ message: '正在检索相关档案并生成回答…', type: 'info' });

    const updateAssistant = (updater: (message: ChatMessage) => ChatMessage) => {
      setMessages((prev) => prev.map((message) => (message.id === assistantMessageId ? updater(message) : message)));
    };

    const applyPayload = (payload: StreamPayload) => {
      if (payload.citations) {
        updateAssistant((message) => ({ ...message, citations: payload.citations }));
      }
      if (payload.conversation_id) {
        setActiveConversationId(payload.conversation_id);
      }
      if (payload.text) {
        setRequestState('streaming');
        updateAssistant((message) => ({ ...message, content: message.content + payload.text }));
      }
      if (payload.degraded) {
        updateAssistant((message) => ({ ...message, degraded: true }));
        setNotice({ message: '当前回答基于检索片段整理。', type: 'info' });
      }
      if (payload.error) {
        setRequestState('error');
        setNotice({ message: payload.error, type: 'error' });
        updateAssistant((message) => ({ ...message, error: payload.error, streaming: false }));
      }
      if (payload.done) {
        updateAssistant((message) => ({ ...message, streaming: false }));
        setRequestState((current) => (current === 'error' ? current : 'idle'));
      }
    };

    const processLine = (line: string) => {
      if (!line.startsWith('data: ')) return;
      try {
        applyPayload(JSON.parse(line.slice(6)) as StreamPayload);
      } catch {
        // 忽略格式不正确的 SSE 行
      }
    };

    try {
      const res = await fetch(`${apiBase}/api/rag/stream`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          query: userQuery,
          conversation_id: activeConversationId,
          history_window: HISTORY_WINDOW,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res, '查询失败，请稍后重试', { redirectOn401To: '/login?next=/' }));
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('浏览器不支持流式读取');
      }

      setRequestState('streaming');
      setNotice(null);

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lines.forEach(processLine);
      }

      if (buffer.trim()) {
        processLine(buffer.trim());
      }
    } catch (err) {
      if (isAbortError(err)) {
        updateAssistant((message) => ({
          ...message,
          streaming: false,
          content: message.content || '已停止本次生成。',
        }));
        return;
      }

      const errorMessage = err instanceof Error ? err.message : '查询失败，请稍后重试';
      setRequestState('error');
      setNotice({ message: errorMessage, type: 'error' });
      updateAssistant((message) => ({
        ...message,
        error: errorMessage,
        streaming: false,
        content: message.content || '抱歉，本次回答未能成功生成。',
      }));
    } finally {
      setMessages((prev) => prev.map((message) => (message.id === assistantMessageId ? { ...message, streaming: false } : message)));
      setRequestState((current) => (current === 'submitting' || current === 'streaming' ? 'idle' : current));
      abortRef.current = null;
    }
  }, [activeConversationId, navigate, token]);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    await submitQuery(query, { clearInput: true });
  }, [query, submitQuery]);

  const handleRetryLast = useCallback(async () => {
    if (!lastSubmittedQuery || isBusy) return;
    await submitQuery(lastSubmittedQuery);
  }, [isBusy, lastSubmittedQuery, submitQuery]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMobileViewport = window.matchMedia('(max-width: 767px)').matches;
    if (isMobileViewport) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isBusy && query.trim()) {
        void submitQuery(query, { clearInput: true });
      }
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 overflow-x-hidden md:space-y-6">
      <section className="overflow-hidden rounded-2xl border border-ink-dark/10 bg-white/95 shadow-sm md:rounded-3xl">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(164,25,61,0.08),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,255,255,0.92))] px-4 py-4 sm:px-5 md:px-8 md:py-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-5">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-serif font-bold tracking-tight text-ink-dark md:text-4xl">AI 校史问答</h1>
              <p className="mt-2 text-sm leading-6 text-ink-light md:mt-3 md:text-base">{pageSummary}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-3">
              {token ? (
                <>
                  <button
                    type="button"
                    onClick={handleNewConversation}
                    disabled={isBusy}
                    className="rounded-xl border border-ink-dark/15 px-3 py-2.5 text-sm font-medium text-ink-dark transition-colors hover:border-sdu-red hover:text-sdu-red disabled:cursor-not-allowed disabled:opacity-60 md:px-4"
                  >
                    新对话
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-xl border border-ink-dark/15 px-3 py-2.5 text-sm font-medium text-ink-dark transition-colors hover:border-sdu-red hover:text-sdu-red md:px-4"
                  >
                    退出登录
                  </button>
                </>
              ) : (
                <Link
                  to="/login?next=/"
                  className="col-span-2 rounded-xl bg-sdu-red px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-sdu-red-hover md:col-span-1"
                >
                  登录后提问
                </Link>
              )}
            </div>
          </div>

          {notice ? <InlineNotice message={notice.message} type={notice.type} className="mt-4 md:mt-5" /> : null}

          <form onSubmit={handleSearch} className="mt-4 space-y-3 md:mt-5 md:space-y-4">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="例如：山东大学的历史演变是怎样的？"
              className="min-h-[92px] w-full resize-y rounded-xl border border-ink-dark/15 bg-white px-3.5 py-3 text-base text-ink-dark shadow-sm focus:outline-none focus:ring-2 focus:ring-sdu-red/30 disabled:cursor-not-allowed disabled:bg-gray-100 md:min-h-[120px] md:rounded-2xl md:px-4"
              disabled={!token || isBusy}
            />

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setQuery(prompt)}
                    className="max-w-[82vw] shrink-0 truncate rounded-full border border-ink-dark/10 bg-white px-3.5 py-2 text-sm text-ink-dark transition-colors hover:border-sdu-red/30 hover:text-sdu-red"
                    title={prompt}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                <button
                  type="button"
                  onClick={handleRetryLast}
                  disabled={!canRetry}
                  className="min-w-0 rounded-xl border border-ink-dark/15 px-3 py-3 text-sm font-medium text-ink-dark transition-colors hover:border-sdu-red hover:text-sdu-red disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
                >
                  重试上一问
                </button>
                {isBusy ? (
                  <button
                    type="button"
                    onClick={handleAbort}
                    className="min-w-0 rounded-xl border border-sdu-red/30 bg-sdu-red/5 px-3 py-3 text-sm font-medium text-sdu-red transition-colors hover:bg-sdu-red/10 sm:px-4"
                  >
                    停止生成
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={!token || !query.trim() || isBusy}
                  className="col-span-2 rounded-xl bg-sdu-red px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-sdu-red-hover disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-1"
                >
                  {isBusy ? '生成中…' : '发送问题'}
                </button>
              </div>
            </div>

            {!token ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-dark/10 bg-paper-bg/70 px-3.5 py-3 text-sm text-ink-light md:rounded-2xl md:px-4 md:py-4">
                <p>请先登录后再使用问答。</p>
                <Link to="/login?next=/" className="shrink-0 font-medium text-sdu-red transition-colors hover:text-sdu-red-hover">
                  前往登录
                </Link>
              </div>
            ) : (
              <p className="text-xs leading-5 text-ink-light md:text-sm">桌面端按 Enter 发送，Shift + Enter 换行；移动端请使用发送按钮提交。</p>
            )}
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-ink-dark/10 bg-white shadow-sm md:rounded-3xl">
        <div className="border-b border-ink-dark/10 px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center justify-between gap-3 md:flex-row">
            <div>
              <h2 className="font-serif text-lg font-bold text-ink-dark md:text-xl">对话记录</h2>
              <p className="mt-1 hidden text-sm text-ink-light md:block">可查看最近的问答内容。</p>
            </div>
            <p className="shrink-0 text-xs text-ink-light md:text-sm">
              {messages.length ? `共 ${messages.length} 条消息` : token ? '等待你的第一个问题' : '登录后开始提问'}
            </p>
          </div>
        </div>

        <div className="max-h-none overflow-visible bg-paper-bg/60 px-3 py-4 md:max-h-[62vh] md:overflow-y-auto md:px-6 md:py-5">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-dark/20 bg-white/80 p-5 text-center shadow-sm md:rounded-2xl md:p-8">
              <p className="text-base font-medium text-ink-dark">{token ? '还没有开始对话' : '登录后即可开始问答'}</p>
              <p className="mt-1.5 text-sm leading-6 text-ink-light md:mt-2">
                {token ? '可直接输入问题开始。' : '登录后即可使用。'}
              </p>
              <div className="mt-4 flex justify-start gap-2 overflow-x-auto pb-1 md:mt-5 md:flex-wrap md:justify-center md:overflow-visible md:pb-0">
                {token ? QUICK_PROMPTS.slice(0, 3).map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setQuery(prompt)}
                    className="max-w-[76vw] shrink-0 truncate rounded-full border border-ink-dark/10 bg-paper-bg px-3 py-1.5 text-sm text-ink-dark hover:border-sdu-red/30 hover:text-sdu-red"
                    title={prompt}
                  >
                    {prompt}
                  </button>
                )) : (
                  <Link to="/login?next=/" className="rounded-full border border-sdu-red/20 bg-sdu-red/5 px-4 py-2 text-sm font-medium text-sdu-red transition-colors hover:bg-sdu-red/10">
                    去登录
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="min-w-0 space-y-3 md:space-y-4">
              {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
