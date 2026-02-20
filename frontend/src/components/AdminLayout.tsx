import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import useSWR from 'swr';
import { clearAuthToken, fetcher } from '../services/api';

export default function AdminLayout() {
  const navigate = useNavigate();
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
    `px-4 py-2 rounded-md transition-colors ${isActive ? 'bg-[#9C0C13] text-white' : 'hover:bg-white/10'}`;

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-64 bg-ink-dark text-white flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-white/10 font-serif font-bold text-lg tracking-wider">
          SDU Admin
        </div>
        <nav className="flex-1 py-6 flex flex-col gap-2 px-4">
          <NavLink to="/admin/dashboard" className={navClass}>数据大盘</NavLink>
          <NavLink to="/admin/upload" className={navClass}>档案上传</NavLink>
          <NavLink to="/admin/chunks" className={navClass}>切片管理</NavLink>
          <NavLink to="/admin/quiz-manager" className={navClass}>题库管理</NavLink>
          <NavLink to="/admin/users" className={navClass}>用户管理</NavLink>
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="text-sm text-white/60 mb-2 truncate">{user.email}</div>
          <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 rounded-md transition-colors">
            退出登录
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
