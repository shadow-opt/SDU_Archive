import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
          <Route path="rag-chunks" element={<RagChunks />} />
          <Route path="quiz-manager" element={<QuizManager />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
