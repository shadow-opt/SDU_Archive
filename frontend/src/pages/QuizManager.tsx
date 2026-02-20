import { useEffect, useState } from 'react';
import { apiBase, getAuthHeaders, parseApiError } from '../services/api';
import InlineNotice from '../components/InlineNotice';

type Question = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  question_type: string;
  explanation?: string;
  points: number;
  created_at: string;
};

type QuestionForm = {
  prompt: string;
  question_type: string;
  options: string[];
  correct_index: number;
  points: number;
  explanation: string;
};

const initialForm: QuestionForm = {
  prompt: '',
  question_type: 'single_choice',
  options: ['', ''],
  correct_index: 0,
  points: 1,
  explanation: '',
};

export default function QuizManager() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [keyword, setKeyword] = useState('');
  const [form, setForm] = useState<QuestionForm>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/quiz/questions/admin`, {
        headers: getAuthHeaders(true),
      });
      if (!res.ok) {
        setStatus(await parseApiError(res, '加载题目失败'));
        return;
      }
      const data = (await res.json()) as Question[];
      setQuestions(data);
    } catch {
      setStatus('加载题目失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQuestions();
  }, []);

  const resetDrawer = () => {
    setEditingId(null);
    setForm(initialForm);
    setDrawerOpen(false);
  };

  const createOrUpdateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedOptions = form.options.map((o) => o.trim()).filter(Boolean);
    if (parsedOptions.length < 2) {
      setStatus('至少保留两个选项');
      return;
    }
    if (form.correct_index < 0 || form.correct_index >= parsedOptions.length) {
      setStatus('正确答案序号超出范围');
      return;
    }

    setStatus(editingId ? '更新中...' : '创建中...');
    try {
      const url = editingId ? `${apiBase}/api/quiz/questions/${editingId}` : `${apiBase}/api/quiz/questions`;
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          prompt: form.prompt,
          options: parsedOptions,
          correct_index: form.correct_index,
          points: form.points,
          question_type: form.question_type,
          explanation: form.explanation,
        }),
      });

      if (!res.ok) {
        setStatus(await parseApiError(res, editingId ? '更新失败' : '创建失败'));
        return;
      }

      setStatus(editingId ? '题目已更新' : '题目已创建');
      resetDrawer();
      await loadQuestions();
    } catch {
      setStatus(editingId ? '更新失败，请稍后重试' : '创建失败，请稍后重试');
    }
  };

  const deleteQuestion = async (questionId: string) => {
    setStatus('删除中...');
    try {
      const res = await fetch(`${apiBase}/api/quiz/questions/${questionId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(true),
      });
      if (!res.ok) {
        setStatus(await parseApiError(res, '删除失败'));
        return;
      }
      setStatus('题目已删除');
      await loadQuestions();
    } catch {
      setStatus('删除失败，请稍后重试');
    }
  };

  const openCreateDrawer = () => {
    setEditingId(null);
    setForm(initialForm);
    setDrawerOpen(true);
  };

  const openEditDrawer = (question: Question) => {
    setEditingId(question.id);
    setForm({
      prompt: question.prompt,
      question_type: question.question_type || 'single_choice',
      options: question.options.length ? question.options : ['', ''],
      correct_index: question.correct_index,
      points: question.points,
      explanation: question.explanation || '',
    });
    setDrawerOpen(true);
  };

  const addOption = () => {
    setForm((prev) => ({ ...prev, options: [...prev.options, ''] }));
  };

  const removeOption = (index: number) => {
    if (form.options.length <= 2) return;
    const next = form.options.filter((_, i) => i !== index);
    setForm((prev) => ({
      ...prev,
      options: next,
      correct_index: prev.correct_index >= next.length ? next.length - 1 : prev.correct_index,
    }));
  };

  const onImportCsv = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setStatus('批量导入中...');
    const body = new FormData();
    body.append('file', file);
    try {
      const res = await fetch(`${apiBase}/api/quiz/questions/import-csv`, {
        method: 'POST',
        headers: {
          Authorization: getAuthHeaders(true).Authorization || '',
        },
        body,
      });
      if (!res.ok) {
        setStatus(await parseApiError(res, '导入失败'));
        return;
      }
      const payload = (await res.json()) as { created?: number };
      setStatus(`导入完成，新增 ${payload.created ?? 0} 道题`);
      await loadQuestions();
    } catch {
      setStatus('导入失败，请稍后重试');
    } finally {
      setImporting(false);
    }
  };

  const downloadCsvTemplate = () => {
    const content = 'prompt,options,correct_index,points,question_type,explanation\n"山东大学建校于哪一年?","1901|1902|1903|1904",1,2,single_choice,"山东大学前身山东大学堂于1901年创办"\n';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'quiz-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredQuestions = questions.filter((q) => {
    if (!keyword.trim()) return true;
    const needle = keyword.toLowerCase();
    return q.prompt.toLowerCase().includes(needle) || q.options.some((o) => o.toLowerCase().includes(needle));
  });

  return (
    <div className="bg-white rounded-2xl border border-ink-dark/10 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl font-serif font-bold">互动题库 CMS</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadCsvTemplate}
            className="px-3 py-2 text-sm rounded-lg border border-ink-dark/20 hover:border-[#9C0C13]"
          >
            下载模板
          </button>
          <label className="px-3 py-2 text-sm rounded-lg border border-ink-dark/20 hover:border-[#9C0C13] cursor-pointer">
            {importing ? '导入中...' : '批量导入 CSV'}
            <input type="file" accept=".csv" className="hidden" onChange={(e) => void onImportCsv(e.target.files?.[0] ?? null)} disabled={importing} />
          </label>
          <button
            type="button"
            onClick={openCreateDrawer}
            className="px-4 py-2 rounded-lg bg-[#9C0C13] text-white hover:bg-[#7d0a10]"
          >
            + 新增题目
          </button>
        </div>
      </div>

      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="按题干或解析搜索..."
        className="w-full mb-4 px-4 py-3 rounded-lg border border-ink-dark/20"
      />
      <p className="text-xs text-ink-light mb-4">CSV 格式：`prompt,options,correct_index,points,question_type,explanation`，其中 `options` 用 `|` 分隔。</p>

      <div className="overflow-x-auto border border-ink-dark/10 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">题干</th>
              <th className="px-3 py-2">类型</th>
              <th className="px-3 py-2">分值</th>
              <th className="px-3 py-2">创建时间</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredQuestions.map((q) => (
              <tr key={q.id} className="border-t border-ink-dark/10 align-top">
                <td className="px-3 py-2 max-w-xl">
                  <p className="font-medium line-clamp-2">{q.prompt}</p>
                  {!!q.explanation && <p className="text-xs text-ink-light mt-1 line-clamp-2">解析：{q.explanation}</p>}
                </td>
                <td className="px-3 py-2 text-ink-light">{q.question_type}</td>
                <td className="px-3 py-2 text-ink-light">{q.points}</td>
                <td className="px-3 py-2 text-ink-light">{new Date(q.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditDrawer(q)}
                      className="px-3 py-1.5 rounded-md bg-[#9C0C13] text-white hover:bg-[#7d0a10]"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteQuestion(q.id)}
                      className="px-3 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !filteredQuestions.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-ink-light">暂无匹配题目</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && <p className="text-sm text-ink-light mt-3">加载中...</p>}

      {status && (
        <InlineNotice
          message={status}
          type={status.includes('已创建') || status.includes('已删除') || status.includes('已更新') || status.includes('导入完成') ? 'success' : status.includes('中...') ? 'info' : 'error'}
          className="mt-4"
        />
      )}

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={resetDrawer} />
          <div className="w-full max-w-xl bg-white h-full overflow-y-auto border-l border-ink-dark/10 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-serif font-bold">{editingId ? '编辑题目' : '新增题目'}</h3>
              <button type="button" onClick={resetDrawer} className="text-ink-light hover:text-ink-dark">关闭</button>
            </div>

            <form onSubmit={createOrUpdateQuestion} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">题干</label>
                <textarea
                  rows={4}
                  value={form.prompt}
                  onChange={(e) => setForm((prev) => ({ ...prev, prompt: e.target.value }))}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:ring-2 focus:ring-[#9C0C13]/40 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">题目类型</label>
                  <select
                    value={form.question_type}
                    onChange={(e) => setForm((prev) => ({ ...prev, question_type: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-ink-dark/20"
                  >
                    <option value="single_choice">single_choice</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">分值</label>
                  <input
                    type="number"
                    min={1}
                    value={form.points}
                    onChange={(e) => setForm((prev) => ({ ...prev, points: Number(e.target.value) || 1 }))}
                    className="w-full px-4 py-3 rounded-lg border border-ink-dark/20"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">选项动态管理</label>
                  <button type="button" onClick={addOption} className="text-sm text-[#9C0C13] hover:underline">添加选项</button>
                </div>
                <div className="space-y-2">
                  {form.options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={form.correct_index === idx}
                        onChange={() => setForm((prev) => ({ ...prev, correct_index: idx }))}
                        aria-label={`mark-correct-${idx}`}
                      />
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const next = [...form.options];
                          next[idx] = e.target.value;
                          setForm((prev) => ({ ...prev, options: next }));
                        }}
                        className="flex-1 px-3 py-2 rounded-lg border border-ink-dark/20"
                        placeholder={`选项 ${idx + 1}`}
                      />
                      <button type="button" onClick={() => removeOption(idx)} className="px-2 py-1 text-xs rounded border border-red-200 text-red-700">删除</button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">题目解析/史实出处</label>
                <textarea
                  rows={4}
                  value={form.explanation}
                  onChange={(e) => setForm((prev) => ({ ...prev, explanation: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg border border-ink-dark/20"
                  placeholder="用于学生答题后展示知识科普"
                />
              </div>

              <button className="w-full py-3 bg-[#9C0C13] text-white rounded-lg hover:bg-[#7d0a10] transition-colors">
                {editingId ? '保存修改' : '创建题目'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
