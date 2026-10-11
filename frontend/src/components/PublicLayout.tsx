import { useEffect, useState } from 'react';
import { LogIn, Menu, X } from 'lucide-react';
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import { getAuthToken } from '../services/api';

export default function PublicLayout() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(getAuthToken()));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const isHistoryRoute = location.pathname === '/';

  useEffect(() => {
    const syncAuthState = () => setIsLoggedIn(Boolean(getAuthToken()));

    syncAuthState();
    window.addEventListener('storage', syncAuthState);
    window.addEventListener('focus', syncAuthState);
    window.addEventListener('authchange', syncAuthState);

    return () => {
      window.removeEventListener('storage', syncAuthState);
      window.removeEventListener('focus', syncAuthState);
      window.removeEventListener('authchange', syncAuthState);
    };
  }, []);

  const navClassName = ({ isActive }: { isActive: boolean }) =>
    `border-b-2 px-1 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sdu-red ${
      isActive
        ? 'border-sdu-red text-sdu-red'
        : 'border-transparent text-ink-dark/70 hover:border-ink-dark/20 hover:text-ink-dark'
    }`;

  const mobileNavClassName = ({ isActive }: { isActive: boolean }) =>
    `border-l-2 px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sdu-red ${
      isActive
        ? 'border-sdu-red bg-sdu-red/5 text-sdu-red'
        : 'border-transparent text-ink-dark/75 hover:border-ink-dark/20 hover:text-ink-dark'
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f5f2]">
      <header className="sticky top-0 z-50 border-b border-ink-dark/15 bg-[#fbfaf7]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-sdu-red">
            <BrandLogo
              title="山东大学校史档案"
              titleClassName="text-base sm:text-lg"
              iconClassName="h-9 w-9"
            />
          </Link>
          <nav aria-label="主导航" className="hidden items-center gap-6 md:flex">
            <NavLink to="/" end className={navClassName}>校史</NavLink>
            <NavLink to="/ask" className={navClassName}>AI问史</NavLink>
            <NavLink to="/quiz" className={navClassName}>互动题库</NavLink>
            {!isLoggedIn ? (
              <NavLink to="/login" className={navClassName}>
                <span className="inline-flex items-center gap-1.5">
                  <LogIn aria-hidden="true" className="h-4 w-4" />
                  登录
                </span>
              </NavLink>
            ) : (
              <span className="border-l border-ink-dark/15 pl-5 text-xs text-ink-light">账号已登录</span>
            )}
          </nav>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((current) => !current)}
            className="inline-flex h-11 w-11 items-center justify-center border border-ink-dark/20 text-ink-dark transition-colors hover:border-sdu-red hover:text-sdu-red focus:outline-none focus-visible:ring-2 focus-visible:ring-sdu-red md:hidden"
            aria-expanded={mobileMenuOpen}
            aria-label="切换导航菜单"
          >
            {mobileMenuOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen ? (
          <div className="border-t border-ink-dark/15 bg-[#fbfaf7] px-4 py-3 md:hidden">
            <nav aria-label="移动端主导航" className="flex flex-col gap-1">
              <NavLink to="/" end onClick={() => setMobileMenuOpen(false)} className={mobileNavClassName}>校史</NavLink>
              <NavLink to="/ask" onClick={() => setMobileMenuOpen(false)} className={mobileNavClassName}>AI问史</NavLink>
              <NavLink to="/quiz" onClick={() => setMobileMenuOpen(false)} className={mobileNavClassName}>互动题库</NavLink>
              {!isLoggedIn ? (
                <NavLink to="/login" onClick={() => setMobileMenuOpen(false)} className={mobileNavClassName}>登录</NavLink>
              ) : (
                <span className="border-l-2 border-transparent px-3 py-2.5 text-sm text-ink-light">账号已登录</span>
              )}
            </nav>
          </div>
        ) : null}
      </header>

      <main className={isHistoryRoute ? 'w-full flex-1' : 'w-full flex-1 px-3 py-5 sm:px-6 sm:py-8 md:py-12'}>
        <div className={isHistoryRoute ? 'w-full' : 'mx-auto max-w-6xl'}>
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-ink-dark/15 bg-[#efeee9]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 text-sm text-ink-light sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <p>© {new Date().getFullYear()} 山东大学校史档案</p>
          <div className="flex items-center gap-5">
            <Link to="/ask" className="hover:text-sdu-red">AI问史</Link>
            <Link to="/quiz" className="hover:text-sdu-red">互动题库</Link>
            <Link to="/admin/login" className="hover:text-sdu-red">管理入口</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
