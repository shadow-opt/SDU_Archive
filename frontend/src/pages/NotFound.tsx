import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <h1 className="text-6xl font-serif font-bold text-sdu-red mb-4">404</h1>
      <p className="text-lg text-ink-light mb-8">页面不存在</p>
      <Link to="/" className="px-5 py-2.5 bg-sdu-red text-white rounded-lg hover:bg-sdu-red-hover transition-colors">
        返回首页
      </Link>
    </div>
  );
}
