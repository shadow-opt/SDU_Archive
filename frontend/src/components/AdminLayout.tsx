import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { clearAuthToken, fetcher } from '../services/api';
import BrandLogo from './BrandLogo';

const navItems = [
  { to: '/admin/dashboard', label: '数据大盘' },
  { to: '/admin/upload', label: '档案上传' },
  { to: '/admin/chunks', label: '切片管理' },
  { to: '/admin/quiz-manager', label: '题库管理' },
  { to: '/admin/users', label: '用户管理' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: user, error, isLoading } = useSWR('/api/auth/me', fetcher);

  useEffect(() => {
    if (!isLoading && (error || !user || user.role !== 'admin')) {
      navigate('/admin/login');
    }
  }, [user, error, isLoading, navigate]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-ink-light">加载中...</div>;
  if (!user || user.role !== 'admin') return null;

  const handleLogout = () => {
    clearAuthToken();
    navigate('/admin/login');
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2 rounded-md transition-colors ${isActive ? 'bg-[#9C0C13] text-white' : 'hover:bg-white/10'}`;

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      <aside className="hidden w-64 shrink-0 bg-ink-dark text-white lg:flex lg:flex-col">
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <BrandLogo
            title="SDU Admin"
            subtitle="校史档案库管理后台"
            theme="dark"
            iconClassName="h-9 w-9"
            titleClassName="text-lg"
            subtitleClassName="text-xs"
          />
        </div>
        <nav className="flex-1 py-6 flex flex-col gap-2 px-4">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass}>{item.label}</NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="text-sm text-white/60 mb-2 truncate">{user.email}</div>
          <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 rounded-md transition-colors">
            退出登录
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-ink-dark/10 bg-white/95 shadow-sm backdrop-blur lg:hidden">
          <div className="flex h-16 items-center justify-between gap-3 px-4">
            <BrandLogo
              title="SDU Admin"
              subtitle="管理后台"
              iconClassName="h-9 w-9"
              titleClassName="text-base"
              subtitleClassName="text-xs"
            />
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="rounded-lg border border-ink-dark/20 px-3 py-2 text-sm text-ink-dark"
            >
              {mobileMenuOpen ? '关闭' : '菜单'}
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="border-t border-ink-dark/10 bg-ink-dark px-4 py-4 text-white">
              <nav className="flex flex-col gap-2">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={navClass}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="mb-2 truncate text-sm text-white/60">{user.email}</div>
                <button
                  onClick={handleLogout}
                  className="w-full rounded-md px-4 py-2 text-left text-sm text-red-300 transition-colors hover:bg-white/10"
                >
                  退出登录
                </button>
              </div>
            </div>
          )}
        </header>
        <main className="min-w-0 overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
