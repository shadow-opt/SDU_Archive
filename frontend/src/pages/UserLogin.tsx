import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import InlineNotice from '../components/InlineNotice';
import { apiBase, parseApiError } from '../services/api';

type Notice = {
  msg: string;
  type: 'success' | 'error' | 'info';
};

export default function UserLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get('next');
    return value && value.startsWith('/') ? value : '/';
  }, [location.search]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice({ msg: '正在登录，请稍候…', type: 'info' });
    setLoggingIn(true);

    const form = new FormData();
    form.append('username', email);
    form.append('password', password);

    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res, '登录失败，请检查邮箱或密码'));
      }

      const data = await res.json();
      localStorage.setItem('token', data.access_token);
      setNotice({ msg: '登录成功，正在进入问答页…', type: 'success' });
      navigate(nextPath, { replace: true });
    } catch (err) {
      setNotice({ msg: err instanceof Error ? err.message : '登录失败，请稍后重试', type: 'error' });
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[72vh] max-w-5xl items-center justify-center px-4 py-8">
      <div className="grid w-full max-w-4xl gap-6 rounded-[28px] border border-ink-dark/10 bg-white p-6 shadow-xl md:grid-cols-[1.05fr_0.95fr] md:p-8">
        <div className="rounded-3xl bg-[radial-gradient(circle_at_top_left,rgba(164,25,61,0.12),transparent_42%),linear-gradient(180deg,rgba(255,248,248,0.95),rgba(255,255,255,0.98))] p-6 md:p-8 flex h-full flex-col">
          <BrandLogo
            title="校史知识库"
            subtitle="登录后使用 AI 问答"
            stacked
            iconClassName="h-14 w-14"
            titleClassName="text-3xl"
          />
          <p className="mt-6 text-sm leading-7 text-ink-light md:text-base">
            登录后即可开始使用。
          </p>
          <div className="mt-auto pt-6 flex flex-wrap gap-3 text-sm">
            <Link to="/" className="font-medium text-sdu-red transition-colors hover:text-sdu-red-hover">
              返回 AI 问答
            </Link>
            <Link to="/quiz" className="text-ink-light transition-colors hover:text-ink-dark">
              去互动答题
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-ink-dark/10 bg-paper-bg/60 p-6 md:p-8">
          <div>
            <h1 className="text-2xl font-serif font-bold text-ink-dark">登录</h1>
            <p className="mt-2 text-sm leading-6 text-ink-light">请输入账号信息。</p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            <label className="block text-sm font-medium text-ink-dark">
              邮箱
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-xl border border-ink-dark/15 bg-white px-4 py-3 transition-colors focus:border-sdu-red focus:outline-none focus:ring-2 focus:ring-sdu-red/30"
                placeholder="you@sdu.edu.cn"
                required
              />
            </label>

            <label className="block text-sm font-medium text-ink-dark">
              密码
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-xl border border-ink-dark/15 bg-white px-4 py-3 transition-colors focus:border-sdu-red focus:outline-none focus:ring-2 focus:ring-sdu-red/30"
                required
              />
            </label>

            {notice ? <InlineNotice message={notice.msg} type={notice.type} /> : null}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full rounded-xl bg-sdu-red px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-sdu-red-hover disabled:opacity-60"
            >
              {loggingIn ? '登录中…' : '登录并进入问答'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}