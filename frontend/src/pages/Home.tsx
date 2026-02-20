import { useEffect, useState } from 'react';
import { apiBase } from '../services/api';

export default function Home() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<{ source: string; snippet: string }[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('token');
    if (saved) {
      setToken(saved);
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(mode === 'login' ? '登录中...' : '注册中...');

    try {
      if (mode === 'register') {
        const registerRes = await fetch(`${apiBase}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!registerRes.ok) {
          const err = await registerRes.json().catch(() => ({}));
          throw new Error(err.detail || '注册失败');
        }
      }

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
    } catch (err: any) {
      setStatus(err.message || '认证失败');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setAnswer('');
    setCitations([]);
    setStatus('已退出登录');
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (!token) {
      setStatus('请先登录后再进行校史检索');
      return;
    }
    
    setStatus('检索中...');
    setAnswer('');
    setCitations([]);

    try {
      const res = await fetch(`${apiBase}/api/rag/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query }),
      });
      
      if (res.status === 401) {
        localStorage.removeItem('token');
        setToken(null);
        throw new Error('登录已过期，请重新登录');
      }
      if (!res.ok) throw new Error('查询失败');
      
      const data = await res.json();
      setAnswer(data.answer);
      setCitations(data.citations || []);
      setStatus('');
    } catch (err) {
      setStatus('查询失败，请稍后重试');
    }
  };

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
              {mode === 'login' ? '登录并开始检索' : '注册并登录'}
            </button>
          </form>
          <div className="mt-4 text-sm text-ink-light">
            当前模式：{mode === 'login' ? '登录' : '注册'}，
            <button
              type="button"
              className="text-sdu-red ml-1 hover:underline"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              切换到{mode === 'login' ? '注册' : '登录'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-6 text-sm text-ink-light">
          已登录，可开始检索。
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
          disabled={!token || !query.trim() || status === '检索中...'}
          className="absolute right-2 top-2 bottom-2 px-6 bg-sdu-red text-white rounded-full font-medium hover:bg-sdu-red-hover disabled:opacity-50 transition-colors"
        >
          {status === '检索中...' ? '检索中' : '搜索'}
        </button>
      </form>

      {status && status !== '检索中...' && (
        <div className="text-sdu-red mb-8">{status}</div>
      )}

      {answer && (
        <div className="w-full text-left bg-white p-8 rounded-2xl shadow-sm border border-ink-dark/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h3 className="text-xl font-serif font-bold mb-4 text-ink-dark">AI 回答</h3>
          <div className="prose prose-stone max-w-none mb-8 text-ink-dark/80 leading-relaxed">
            {answer}
          </div>
          
          {citations.length > 0 && (
            <div className="border-t border-ink-dark/10 pt-6">
              <h4 className="text-sm font-bold text-ink-light uppercase tracking-wider mb-4">引用文献</h4>
              <ul className="space-y-4">
                {citations.map((cit, idx) => (
                  <li key={idx} className="text-sm bg-paper-bg p-4 rounded-lg border border-ink-dark/5">
                    <span className="font-medium text-sdu-red block mb-1">{cit.source}</span>
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
