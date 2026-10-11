import { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, LogIn } from 'lucide-react';
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
    return value && value.startsWith('/') ? value : '/ask';
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
      window.dispatchEvent(new Event('authchange'));
      setNotice({ msg: '登录成功，正在进入 AI 问史…', type: 'success' });
      navigate(nextPath, { replace: true });
    } catch (err) {
      setNotice({ msg: err instanceof Error ? err.message : '登录失败，请稍后重试', type: 'error' });
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-5xl items-center justify-center py-3 sm:py-6">
      <section className="grid w-full overflow-hidden rounded-lg border border-ink-dark/15 bg-white md:grid-cols-[0.9fr_1.1fr]">
        <div className="flex min-h-72 flex-col bg-[#173f3c] p-7 text-white md:min-h-[34rem] md:p-10">
          <BrandLogo
            title="山东大学校史档案"
            subtitle="登录后进入个人问史会话"
            theme="dark"
            iconClassName="h-11 w-11"
            titleClassName="text-xl"
          />
          <div className="my-auto py-10">
            <BookOpen aria-hidden="true" className="h-8 w-8 text-white/65" />
            <p className="mt-5 max-w-sm font-serif text-3xl font-semibold leading-snug">
              从百年档案中，继续你的校史探索。
            </p>
          </div>
          <p className="text-xs leading-6 text-white/65">
            山东大学校史档案 · AI 问史
          </p>
        </div>

        <div className="flex flex-col justify-center bg-[#fbfaf7] p-6 sm:p-8 md:p-12">
          <div>
            <p className="text-xs font-semibold text-sdu-red">账号验证</p>
            <h1 className="mt-2 font-serif text-3xl font-bold text-ink-dark">登录 AI 问史</h1>
            <p className="mt-3 text-sm leading-6 text-ink-light">请输入账号邮箱和密码。</p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            <label className="block text-sm font-medium text-ink-dark">
              邮箱
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-md border border-ink-dark/20 bg-white px-4 py-3 transition-colors focus:border-sdu-red focus:outline-none focus:ring-2 focus:ring-sdu-red/20"
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
                className="mt-2 w-full rounded-md border border-ink-dark/20 bg-white px-4 py-3 transition-colors focus:border-sdu-red focus:outline-none focus:ring-2 focus:ring-sdu-red/20"
                required
              />
            </label>

            {notice ? <InlineNotice message={notice.msg} type={notice.type} /> : null}

            <button
              type="submit"
              disabled={loggingIn}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-sdu-red px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-sdu-red-hover disabled:opacity-60"
            >
              <LogIn aria-hidden="true" className="h-4 w-4" />
              {loggingIn ? '登录中…' : '登录并进入问答'}
            </button>
          </form>

          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-ink-dark/15 pt-5 text-sm">
            <Link to="/" className="inline-flex items-center gap-1.5 font-medium text-sdu-red transition-colors hover:text-sdu-red-hover">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              返回校史
            </Link>
            <Link to="/ask" className="text-ink-light transition-colors hover:text-ink-dark">
              返回 AI 问史
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
