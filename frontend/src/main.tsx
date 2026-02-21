import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import './index.css'

import PublicLayout from './components/PublicLayout'
import AdminLayout from './components/AdminLayout'
import Home from './pages/Home'
import Quiz from './pages/Quiz'
import AdminLogin from './pages/AdminLogin'
import Upload from './pages/Upload'
import RagChunks from './pages/RagChunks'
import QuizManager from './pages/QuizManager'
import AdminDashboard from './pages/AdminDashboard'
import AdminUsers from './pages/AdminUsers'

function NotFound() {
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="quiz" element={<Quiz />} />
        </Route>
        
        <Route path="/admin/login" element={<AdminLogin />} />
        
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="upload" element={<Upload />} />
          <Route path="chunks" element={<RagChunks />} />
          <Route path="quiz-manager" element={<QuizManager />} />
          <Route path="users" element={<AdminUsers />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
