import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import './App.css'

const apiBase = import.meta.env.VITE_API_BASE ?? ''

type Question = {
  id: string
  prompt: string
  options: string[]
  points: number
}

type RagCitation = { source: string; snippet: string }

function App() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [role, setRole] = useState<string>('user')
  const [status, setStatus] = useState<string>('')

  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState<RagCitation[]>([])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const [questions, setQuestions] = useState<Question[]>([])
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [score, setScore] = useState<number | null>(null)

  const [newQuestion, setNewQuestion] = useState({ prompt: '', options: '', correct: 0, points: 1 })
  const [chunkEdit, setChunkEdit] = useState({ id: '', content: '' })

  const headers = useMemo<Record<string, string>>(() => {
    if (token) {
      return { Authorization: `Bearer ${token}` }
    }
    return {} as Record<string, string>
  }, [token])

  useEffect(() => {
    const stored = localStorage.getItem('token')
    if (stored) {
      setToken(stored)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    fetch(`${apiBase}/api/auth/me`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((user) => {
        if (user) {
          setRole(user.role)
          setStatus(`欢迎回来，${user.email}`)
        }
      })
      .catch(() => setStatus(''))
    fetchQuestions()
  }, [token])

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault()
    setStatus('正在提交...')
    if (mode === 'register') {
      const res = await fetch(`${apiBase}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        setStatus('注册失败，检查邮箱是否已存在')
        return
      }
    }
    const form = new FormData()
    form.append('username', email)
    form.append('password', password)
    const res = await fetch(`${apiBase}/api/auth/login`, { method: 'POST', body: form })
    if (!res.ok) {
      setStatus('登录失败，请检查邮箱或密码')
      return
    }
    const data = await res.json()
    setToken(data.access_token)
    localStorage.setItem('token', data.access_token)
    setStatus('登录成功')
  }

  const askQuestion = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) {
      setStatus('请先登录')
      return
    }
    setStatus('检索中...')
    const res = await fetch(`${apiBase}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) {
      setStatus('查询失败')
      return
    }
    const data = await res.json()
    setAnswer(data.answer)
    setCitations(data.citations || [])
    setStatus('完成')
  }

  const uploadDoc = async (e: FormEvent) => {
    e.preventDefault()
    if (!file || !token) return
    setStatus('上传中...')
    const form = new FormData()
    form.append('title', title || file.name)
    form.append('description', description)
    form.append('file', file)
    const res = await fetch(`${apiBase}/api/documents/upload`, {
      method: 'POST',
      headers,
      body: form,
    })
    setStatus(res.ok ? '上传成功并已切片' : '上传失败')
  }

  const fetchQuestions = async () => {
    if (!token) return
    const res = await fetch(`${apiBase}/api/quiz/questions`, { headers })
    if (res.ok) {
      const data = await res.json()
      setQuestions(data)
    }
  }

  const submitQuiz = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedQuestion || selectedOption === null || !token) return
    const res = await fetch(`${apiBase}/api/quiz/questions/${selectedQuestion}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ answer_index: selectedOption }),
    })
    if (res.ok) {
      const data = await res.json()
      setScore(data.total_points)
      setStatus(data.correct ? '回答正确！' : '回答错误')
    } else {
      const error = await res.json().catch(() => ({}))
      setStatus(error.detail || '提交失败')
    }
  }

  const createQuestion = async (e: FormEvent) => {
    e.preventDefault()
    const opts = newQuestion.options.split('\n').map((o) => o.trim()).filter(Boolean)
    const res = await fetch(`${apiBase}/api/quiz/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ prompt: newQuestion.prompt, options: opts, correct_index: newQuestion.correct, points: newQuestion.points }),
    })
    setStatus(res.ok ? '题目已创建' : '创建失败')
    if (res.ok) fetchQuestions()
  }

  const updateChunk = async (e: FormEvent) => {
    e.preventDefault()
    const res = await fetch(`${apiBase}/api/chunks/${chunkEdit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ content: chunkEdit.content }),
    })
    setStatus(res.ok ? '切片已更新并重嵌入' : '更新失败')
  }

  const logout = () => {
    setToken(null)
    localStorage.removeItem('token')
    setRole('user')
    setStatus('已退出')
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__badge">SDU ARCHIVE</div>
        <h1>山东大学校史互动档案库</h1>
        <p>红色主题、移动优先的校史问答、档案检索与互动学习平台。</p>
        <div className="hero__actions">
          {!token ? (
            <button className="btn primary" onClick={() => document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' })}>
              立即登录/注册
            </button>
          ) : (
            <button className="btn ghost" onClick={logout}>
              退出登录
            </button>
          )}
          <button className="btn light" onClick={() => document.getElementById('rag')?.scrollIntoView({ behavior: 'smooth' })}>
            体验问答
          </button>
        </div>
        {status && <div className="status">{status}</div>}
      </header>

      <main className="grid">
        <section id="auth" className="card wide">
          <div className="card__header">
            <div>
              <p className="eyebrow">访问控制</p>
              <h2>{mode === 'login' ? '登录' : '注册'}您的账号</h2>
            </div>
            <div className="chip">{role === 'admin' ? '超级管理员' : '普通用户'}</div>
          </div>
          <form className="form" onSubmit={handleAuth}>
            <div className="input-row">
              <label>邮箱</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@sdu.edu.cn" />
            </div>
            <div className="input-row">
              <label>密码</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="form__footer">
              <div className="switcher">
                <span className="muted">当前模式：</span>
                <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                  切换到{mode === 'login' ? '注册' : '登录'}
                </button>
              </div>
              <button className="btn primary" type="submit">
                {mode === 'login' ? '登录' : '注册并登录'}
              </button>
            </div>
          </form>
        </section>

        <section id="rag" className="card">
          <div className="card__header">
            <p className="eyebrow">史实问答</p>
            <h2>低幻觉 RAG 检索</h2>
          </div>
          <form className="form" onSubmit={askQuestion}>
            <textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="想了解哪段校史？支持自然语言查询" required />
            <button className="btn primary" type="submit">
              发起检索
            </button>
          </form>
          {answer && (
            <div className="answer">
              <h3>回答</h3>
              <p>{answer}</p>
              <div className="citations">
                {citations.map((c, idx) => (
                  <div key={idx} className="citation">
                    <span>出处 {idx + 1}</span>
                    <p>{c.snippet}</p>
                    <code>{c.source}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card__header">
            <p className="eyebrow">档案上传</p>
            <h2>文本/图片入库与切片</h2>
          </div>
          <form className="form" onSubmit={uploadDoc}>
            <div className="input-row">
              <label>标题</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="文件标题" />
            </div>
            <div className="input-row">
              <label>描述（图片请提供文字描述以便检索）</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="为图片补充文字描述，文本文件可留空" />
            </div>
            <div className="input-row">
              <label>文件（最大 100MB）</label>
              <input type="file" required onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <button className="btn primary" type="submit">
              上传并切片
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card__header">
            <p className="eyebrow">互动题库</p>
            <h2>答题赢取积分</h2>
          </div>
          <form className="form" onSubmit={submitQuiz}>
            <div className="input-row">
              <label>选择题目</label>
              <select value={selectedQuestion ?? ''} onChange={(e) => setSelectedQuestion(e.target.value)}>
                <option value="">请选择</option>
                {questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.prompt}（{q.points}分）
                  </option>
                ))}
              </select>
            </div>
            {selectedQuestion && (
              <div className="options">
                {questions
                  .find((q) => q.id === selectedQuestion)
                  ?.options.map((opt, idx) => (
                    <label key={idx} className={`option ${selectedOption === idx ? 'active' : ''}`}>
                      <input type="radio" name="option" checked={selectedOption === idx} onChange={() => setSelectedOption(idx)} />
                      {opt}
                    </label>
                  ))}
              </div>
            )}
            <button className="btn primary" type="submit" disabled={!selectedQuestion}>
              提交答案
            </button>
            {score !== null && <div className="score">当前积分：{score}</div>}
          </form>
        </section>

        {role === 'admin' && (
          <>
            <section className="card">
              <div className="card__header">
                <p className="eyebrow">题库管理</p>
                <h2>创建新题</h2>
              </div>
              <form className="form" onSubmit={createQuestion}>
                <div className="input-row">
                  <label>题干</label>
                  <textarea value={newQuestion.prompt} onChange={(e) => setNewQuestion({ ...newQuestion, prompt: e.target.value })} required />
                </div>
                <div className="input-row">
                  <label>选项（每行一个）</label>
                  <textarea
                    value={newQuestion.options}
                    onChange={(e) => setNewQuestion({ ...newQuestion, options: e.target.value })}
                    placeholder="A\nB\nC"
                    required
                  />
                </div>
                <div className="input-grid">
                  <div>
                    <label>正确选项序号（从 0 开始）</label>
                    <input
                      type="number"
                      min={0}
                      value={newQuestion.correct}
                      onChange={(e) => setNewQuestion({ ...newQuestion, correct: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label>分值</label>
                    <input type="number" min={1} value={newQuestion.points} onChange={(e) => setNewQuestion({ ...newQuestion, points: Number(e.target.value) })} />
                  </div>
                </div>
                <button className="btn light" type="submit">
                  创建题目
                </button>
              </form>
            </section>

            <section className="card">
              <div className="card__header">
                <p className="eyebrow">切片干预</p>
                <h2>编辑或删除错误切片</h2>
              </div>
              <form className="form" onSubmit={updateChunk}>
                <div className="input-row">
                  <label>Chunk ID</label>
                  <input value={chunkEdit.id} onChange={(e) => setChunkEdit({ ...chunkEdit, id: e.target.value })} placeholder="UUID" required />
                </div>
                <div className="input-row">
                  <label>新的内容</label>
                  <textarea value={chunkEdit.content} onChange={(e) => setChunkEdit({ ...chunkEdit, content: e.target.value })} placeholder="修正后的文本" required />
                </div>
                <button className="btn light" type="submit">
                  保存并重嵌入
                </button>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export default App
