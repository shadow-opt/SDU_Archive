import { useEffect, useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import { getAuthToken } from '../services/api';

export default function PublicLayout() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(getAuthToken()));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const syncAuthState = () => setIsLoggedIn(Boolean(getAuthToken()));

    syncAuthState();
    window.addEventListener('storage', syncAuthState);
    window.addEventListener('focus', syncAuthState);

    return () => {
      window.removeEventListener('storage', syncAuthState);
      window.removeEventListener('focus', syncAuthState);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-paper-bg">
      <header className="sticky top-0 z-50 border-b border-ink-dark/10 bg-paper-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="transition-opacity hover:opacity-90">
            <BrandLogo
              title="山东大学校史知识库"
              titleClassName="text-base sm:text-xl"
              iconClassName="h-9 w-9"
            />
          </Link>
          <nav className="hidden gap-5 text-sm font-medium text-ink-dark/70 md:flex">
            <Link to="/" className="rounded-md px-2.5 py-1.5 hover:bg-white hover:text-sdu-red transition-colors">AI问答</Link>
            <Link to="/quiz" className="rounded-md px-2.5 py-1.5 hover:bg-white hover:text-sdu-red transition-colors">互动答题</Link>
            {!isLoggedIn ? <Link to="/login" className="rounded-md px-2.5 py-1.5 hover:bg-white hover:text-sdu-red transition-colors">登录</Link> : null}
            <Link to="/admin/login" className="rounded-md px-2.5 py-1.5 hover:bg-white hover:text-sdu-red transition-colors">管理员</Link>
          </nav>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((current) => !current)}
            className="inline-flex items-center justify-center rounded-md border border-ink-dark/15 px-3 py-2 text-sm font-medium text-ink-dark transition-colors hover:border-sdu-red hover:text-sdu-red md:hidden"
            aria-expanded={mobileMenuOpen}
            aria-label="切换导航菜单"
          >
            {mobileMenuOpen ? '收起' : '菜单'}
          </button>
        </div>
        {mobileMenuOpen ? (
          <div className="border-t border-ink-dark/10 bg-white/95 px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-1 text-sm font-medium text-ink-dark/80">
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-paper-bg hover:text-sdu-red transition-colors">AI问答</Link>
              <Link to="/quiz" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-paper-bg hover:text-sdu-red transition-colors">互动答题</Link>
              {!isLoggedIn ? (
                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-paper-bg hover:text-sdu-red transition-colors">登录</Link>
              ) : null}
              <Link to="/admin/login" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-paper-bg hover:text-sdu-red transition-colors">管理员</Link>
            </nav>
          </div>
        ) : null}
      </header>

      <main className="flex-1 w-full px-4 py-8 sm:px-6 md:py-12">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-ink-dark/10 bg-white/60 py-6 text-center text-sm text-ink-light">
        <p>© {new Date().getFullYear()} 山东大学校史知识库</p>
      </footer>
    </div>
  );
}
