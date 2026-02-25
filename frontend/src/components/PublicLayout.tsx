import { Outlet, Link } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-paper-bg">
      <header className="sticky top-0 z-50 border-b border-ink-dark/10 bg-paper-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 text-sdu-red font-serif font-bold text-xl tracking-wide">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sdu-red text-sm text-white">SDU</span>
            山大校史问答
          </Link>
          <nav className="flex gap-5 text-sm font-medium text-ink-dark/70">
            <Link to="/" className="rounded-md px-2.5 py-1.5 hover:bg-white hover:text-sdu-red transition-colors">问答首页</Link>
            <Link to="/quiz" className="rounded-md px-2.5 py-1.5 hover:bg-white hover:text-sdu-red transition-colors">互动题库</Link>
            <Link to="/admin/login" className="rounded-md px-2.5 py-1.5 hover:bg-white hover:text-sdu-red transition-colors">管理员</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full px-6 py-10 md:py-12">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-ink-dark/10 bg-white/60 py-6 text-center text-sm text-ink-light">
        <p>© {new Date().getFullYear()} 山东大学校史档案馆</p>
      </footer>
    </div>
  );
}
