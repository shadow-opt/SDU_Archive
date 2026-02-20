import { Outlet, Link } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink-dark/10 bg-paper-bg/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sdu-red font-serif font-bold text-xl tracking-wide">
            <span className="w-8 h-8 bg-sdu-red text-white rounded-sm flex items-center justify-center text-sm">SDU</span>
            校史档案库
          </Link>
          <nav className="flex gap-6 text-sm font-medium text-ink-dark/70">
            <Link to="/" className="hover:text-sdu-red transition-colors">首页</Link>
            <Link to="/quiz" className="hover:text-sdu-red transition-colors">互动题库</Link>
            <Link to="/admin/login" className="hover:text-sdu-red transition-colors">管理员入口</Link>
          </nav>
        </div>
      </header>
      
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12">
        <Outlet />
      </main>

      <footer className="py-8 text-center text-sm text-ink-light border-t border-ink-dark/5">
        <p>© {new Date().getFullYear()} 山东大学校史档案馆. All rights reserved.</p>
      </footer>
    </div>
  );
}
