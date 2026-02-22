import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiBase, parseApiError } from '../services/api';
import InlineNotice from '../components/InlineNotice';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
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
        const msg = await parseApiError(res, '登录失败，请检查邮箱或密码');
        throw new Error(msg);
      }

      const data = await res.json();
      localStorage.setItem('token', data.access_token);

      const meRes = await fetch(`${apiBase}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
        },
      });
      if (!meRes.ok) {
        localStorage.removeItem('token');
        throw new Error(await parseApiError(meRes, '用户信息获取失败'));
      }
      const me = await meRes.json();
      if (me.role !== 'admin') {
        localStorage.removeItem('token');
        throw new Error('仅超级管理员可访问后台');
      }

      setNotice({ msg: '登录成功', type: 'success' });
      navigate('/admin/dashboard');
    } catch (err) {
      setNotice({ msg: err instanceof Error ? err.message : '登录失败', type: 'error' });
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper-bg">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-xl border border-ink-dark/5">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-serif font-bold text-sdu-red mb-2">SDU Admin</h1>
          <p className="text-ink-light">校史档案库管理后台</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-ink-dark mb-2">管理员邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:ring-2 focus:ring-sdu-red/50 focus:border-sdu-red transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-dark mb-2">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:ring-2 focus:ring-sdu-red/50 focus:border-sdu-red transition-colors"
              required
            />
          </div>
          
          {notice && <InlineNotice message={notice.msg} type={notice.type} />}

          <button
            type="submit"
            disabled={loggingIn}
            className="w-full py-3 bg-sdu-red text-white rounded-lg font-medium hover:bg-sdu-red-hover transition-colors disabled:opacity-50"
          >
            {loggingIn ? '请稍候...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
