import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { apiBase, getAuthHeaders, parseApiError } from '../services/api';
import InlineNotice from '../components/InlineNotice';

type QuizCollection = {
  id: string;
  title: string;
  description?: string | null;
  sort_order: number;
  is_published: boolean;
  question_count: number;
  answered_count?: number;
  total_points?: number;
};

type ImportIssue = {
  row_number: number;
  prompt?: string | null;
  error: string;
};

type ImportReport = {
  collection_id: string;
  collection_title: string;
  total_rows: number;
  created: number;
  skipped: number;
  issues: ImportIssue[];
};

type Question = {
  id: string;
  collection_id?: string | null;
  prompt: string;
  options: string[];
  correct_index: number;
  question_type: string;
  explanation?: string;
  points: number;
  order_index: number;
  created_at: string;
  updated_at: string;
};

type CollectionForm = {
  title: string;
  description: string;
  sort_order: number;
  is_published: boolean;
};

type QuestionForm = {
  collection_id: string;
  prompt: string;
  question_type: string;
  options: string[];
  correct_index: number;
  points: number;
  explanation: string;
  order_index: number;
};

const initialCollectionForm: CollectionForm = {
  title: '',
  description: '',
  sort_order: 0,
  is_published: true,
};

const initialForm: QuestionForm = {
  collection_id: '',
  prompt: '',
  question_type: 'single_choice',
  options: ['', ''],
  correct_index: 0,
  points: 1,
  explanation: '',
  order_index: 1,
};

export default function QuizManager() {
  const [collections, setCollections] = useState<QuizCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [keyword, setKeyword] = useState('');
  const [collectionForm, setCollectionForm] = useState<CollectionForm>(initialCollectionForm);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [collectionDrawerOpen, setCollectionDrawerOpen] = useState(false);
  const [form, setForm] = useState<QuestionForm>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCollections = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/quiz/collections/admin`, {
        headers: getAuthHeaders(true),
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res, '加载专题失败'));
      }
      const data = (await res.json()) as QuizCollection[];
      setCollections(data);
      setSelectedCollectionId((currentId) => {
        if (currentId && data.some((collection) => collection.id === currentId)) {
          return currentId;
        }
        return data[0]?.id ?? '';
      });
      return data;
    } catch (error) {
      setNotice({ msg: error instanceof Error ? error.message : '加载专题失败，请稍后重试', type: 'error' });
      return [] as QuizCollection[];
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async (collectionId: string) => {
    if (!collectionId) {
      setQuestions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/quiz/questions/admin?collection_id=${encodeURIComponent(collectionId)}`, {
        headers: getAuthHeaders(true),
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res, '加载题目失败'));
      }
      const data = (await res.json()) as Question[];
      setQuestions(data);
    } catch (error) {
      setQuestions([]);
      setNotice({ msg: error instanceof Error ? error.message : '加载题目失败，请稍后重试', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCollections();
  }, []);

  useEffect(() => {
    void loadQuestions(selectedCollectionId);
  }, [selectedCollectionId]);

  const resetDrawer = () => {
    setEditingId(null);
    setForm({ ...initialForm, collection_id: selectedCollectionId, order_index: 1 });
    setDrawerOpen(false);
  };

  const resetCollectionDrawer = () => {
    setEditingCollectionId(null);
    setCollectionForm(initialCollectionForm);
    setCollectionDrawerOpen(false);
  };

  const createOrUpdateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice({ msg: editingCollectionId ? '更新专题中...' : '创建专题中...', type: 'info' });
    try {
      const url = editingCollectionId ? `${apiBase}/api/quiz/collections/${editingCollectionId}` : `${apiBase}/api/quiz/collections`;
      const method = editingCollectionId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(true),
        body: JSON.stringify(collectionForm),
      });

      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, editingCollectionId ? '更新专题失败' : '创建专题失败'), type: 'error' });
        return;
      }

      const payload = (await res.json()) as QuizCollection;
      setNotice({ msg: editingCollectionId ? '专题已更新' : '专题已创建', type: 'success' });
      resetCollectionDrawer();
      await loadCollections();
      setSelectedCollectionId(payload.id);
    } catch {
      setNotice({ msg: editingCollectionId ? '更新专题失败，请稍后重试' : '创建专题失败，请稍后重试', type: 'error' });
    }
  };

  const createOrUpdateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.collection_id) {
      setNotice({ msg: '请先选择题目所属专题', type: 'error' });
      return;
    }
    const parsedOptions = form.options.map((o) => o.trim()).filter(Boolean);
    if (parsedOptions.length < 2) {
      setNotice({ msg: '至少保留两个选项', type: 'error' });
      return;
    }
    if (form.correct_index < 0 || form.correct_index >= parsedOptions.length) {
      setNotice({ msg: '正确答案序号超出范围', type: 'error' });
      return;
    }

    setNotice({ msg: editingId ? '更新中...' : '创建中...', type: 'info' });
    try {
      const url = editingId ? `${apiBase}/api/quiz/questions/${editingId}` : `${apiBase}/api/quiz/questions`;
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          collection_id: form.collection_id,
          prompt: form.prompt,
          options: parsedOptions,
          correct_index: form.correct_index,
          points: form.points,
          question_type: form.question_type,
          explanation: form.explanation,
          order_index: form.order_index,
        }),
      });

      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, editingId ? '更新失败' : '创建失败'), type: 'error' });
        return;
      }

      setNotice({ msg: editingId ? '题目已更新' : '题目已创建', type: 'success' });
      resetDrawer();
      await Promise.all([loadCollections(), loadQuestions(form.collection_id)]);
    } catch {
      setNotice({ msg: editingId ? '更新失败，请稍后重试' : '创建失败，请稍后重试', type: 'error' });
    }
  };

  const deleteCollection = async (collectionId: string) => {
    if (!window.confirm('确定要删除该专题吗？若专题内仍有题目，将无法删除。')) return;
    setNotice({ msg: '删除专题中...', type: 'info' });
    try {
      const res = await fetch(`${apiBase}/api/quiz/collections/${collectionId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(true),
      });
      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, '删除专题失败'), type: 'error' });
        return;
      }
      setNotice({ msg: '专题已删除', type: 'success' });
      await loadCollections();
    } catch {
      setNotice({ msg: '删除专题失败，请稍后重试', type: 'error' });
    }
  };

  const deleteQuestion = async (questionId: string) => {
    if (!window.confirm('确定要删除该题目吗？此操作不可恢复。')) return;
    setNotice({ msg: '删除中...', type: 'info' });
    try {
      const res = await fetch(`${apiBase}/api/quiz/questions/${questionId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(true),
      });
      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, '删除失败'), type: 'error' });
        return;
      }
      setNotice({ msg: '题目已删除', type: 'success' });
      await Promise.all([loadCollections(), loadQuestions(selectedCollectionId)]);
    } catch {
      setNotice({ msg: '删除失败，请稍后重试', type: 'error' });
    }
  };

  const openCreateCollectionDrawer = () => {
    setEditingCollectionId(null);
    setCollectionForm(initialCollectionForm);
    setCollectionDrawerOpen(true);
  };

  const openEditCollectionDrawer = (collection: QuizCollection) => {
    setEditingCollectionId(collection.id);
    setCollectionForm({
      title: collection.title,
      description: collection.description || '',
      sort_order: collection.sort_order,
      is_published: collection.is_published,
    });
    setCollectionDrawerOpen(true);
  };

  const openCreateDrawer = () => {
    setEditingId(null);
    setForm({ ...initialForm, collection_id: selectedCollectionId, order_index: 1 });
    setDrawerOpen(true);
  };

  const openEditDrawer = (question: Question) => {
    setEditingId(question.id);
    setForm({
      collection_id: question.collection_id || selectedCollectionId,
      prompt: question.prompt,
      question_type: question.question_type || 'single_choice',
      options: question.options.length ? question.options : ['', ''],
      correct_index: question.correct_index,
      points: question.points,
      explanation: question.explanation || '',
      order_index: question.order_index,
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
    if (!selectedCollectionId) {
      setNotice({ msg: '请先选择要导入的专题', type: 'error' });
      return;
    }
    setImporting(true);
    setImportReport(null);
    setNotice({ msg: '批量导入中...', type: 'info' });
    const body = new FormData();
    body.append('file', file);
    if (selectedCollectionId) {
      body.append('collection_id', selectedCollectionId);
    }
    try {
      const res = await fetch(`${apiBase}/api/quiz/questions/import-csv`, {
        method: 'POST',
        headers: {
          Authorization: getAuthHeaders(true).Authorization || '',
        },
        body,
      });
      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, '导入失败'), type: 'error' });
        return;
      }
      const payload = (await res.json()) as ImportReport;
      setImportReport(payload);
      setNotice({
        msg: payload.skipped > 0
          ? `导入完成：新增 ${payload.created} 道，跳过 ${payload.skipped} 行，请查看明细。`
          : `导入完成，已新增 ${payload.created} 道题。`,
        type: payload.skipped > 0 ? 'info' : 'success',
      });
      await Promise.all([loadCollections(), loadQuestions(selectedCollectionId)]);
    } catch {
      setNotice({ msg: '导入失败，请稍后重试', type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const downloadCsvTemplate = () => {
    const content = 'prompt,options,correct_index,points,explanation,order_index\n"山东大学建校于哪一年?","1901|1902|1903|1904",1,2,"山东大学前身山东大学堂于1901年创办",1\n';
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
    return q.prompt.toLowerCase().includes(needle)
      || q.options.some((o) => o.toLowerCase().includes(needle))
      || (q.explanation || '').toLowerCase().includes(needle);
  });

  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId) ?? null;
  const buildPublicQuizUrl = (collectionId: string) => `${window.location.origin}/quiz/${collectionId}`;
  const copyQuizUrl = async (collection: QuizCollection) => {
    try {
      await navigator.clipboard.writeText(buildPublicQuizUrl(collection.id));
      setNotice({ msg: `已复制「${collection.title}」扫码链接`, type: 'success' });
    } catch {
      setNotice({ msg: '复制失败，请手动复制链接', type: 'error' });
    }
  };
  const downloadQrCode = (collection: QuizCollection) => {
    const canvas = document.getElementById(`quiz-qr-${collection.id}`) as HTMLCanvasElement | null;
    if (!canvas) {
      setNotice({ msg: '二维码尚未生成，请稍后重试', type: 'error' });
      return;
    }
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `quiz-${collection.title || collection.id}.png`;
    link.click();
  };

  return (
    <div className="bg-white rounded-2xl border border-ink-dark/10 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl font-serif font-bold">互动题库 CMS</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadCsvTemplate}
            className="px-3 py-2 text-sm rounded-lg border border-ink-dark/20 hover:border-sdu-red"
          >
            下载模板
          </button>
          <button
            type="button"
            onClick={openCreateCollectionDrawer}
            className="px-4 py-2 rounded-lg border border-ink-dark/20 hover:border-sdu-red"
          >
            + 新增专题
          </button>
          <label className="px-3 py-2 text-sm rounded-lg border border-ink-dark/20 hover:border-sdu-red cursor-pointer">
            {importing ? '导入中...' : '批量导入 CSV'}
            <input type="file" accept=".csv" className="hidden" onChange={(e) => void onImportCsv(e.target.files?.[0] ?? null)} disabled={importing || !selectedCollectionId} />
          </label>
          <button
            type="button"
            onClick={openCreateDrawer}
            disabled={!selectedCollectionId}
            className="px-4 py-2 rounded-lg bg-sdu-red text-white hover:bg-sdu-red-hover disabled:opacity-50"
          >
            + 新增题目
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-6 mb-4">
        <aside className="border border-ink-dark/10 rounded-2xl p-4 bg-paper-bg/40 h-fit">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-serif font-bold text-lg">专题列表</h3>
            <span className="text-xs text-ink-light">{collections.length} 个</span>
          </div>
          <div className="space-y-3">
            {collections.map((collection) => (
              <div
                key={collection.id}
                className={[
                  'rounded-xl border p-4',
                  collection.id === selectedCollectionId ? 'border-sdu-red bg-white' : 'border-ink-dark/10 bg-white/80',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCollectionId(collection.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink-dark">{collection.title}</p>
                      {collection.description && <p className="text-xs text-ink-light mt-1 line-clamp-2">{collection.description}</p>}
                    </div>
                    <span className={collection.is_published ? 'text-[11px] text-green-700' : 'text-[11px] text-amber-700'}>
                      {collection.is_published ? '已发布' : '未发布'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-ink-light">
                    <span>题目数：{collection.question_count}</span>
                    <span>排序：{collection.sort_order}</span>
                  </div>
                </button>
                <div className="flex items-center gap-2 mt-3">
                  <button type="button" onClick={() => openEditCollectionDrawer(collection)} className="px-3 py-1.5 rounded-md bg-sdu-red text-white text-xs hover:bg-sdu-red-hover">编辑</button>
                  <button type="button" onClick={() => void deleteCollection(collection.id)} className="px-3 py-1.5 rounded-md border border-red-200 text-red-700 text-xs hover:bg-red-50">删除</button>
                </div>
                <div className="mt-3 rounded-lg border border-ink-dark/10 bg-paper-bg/40 p-3">
                  <div className="flex items-center gap-3">
                    <QRCodeCanvas id={`quiz-qr-${collection.id}`} value={buildPublicQuizUrl(collection.id)} size={72} marginSize={1} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-ink-dark">扫码答题入口</p>
                      <p className="mt-1 truncate text-[11px] text-ink-light">{buildPublicQuizUrl(collection.id)}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void copyQuizUrl(collection)} className="px-2.5 py-1.5 rounded-md border border-ink-dark/20 bg-white text-xs hover:border-sdu-red">复制链接</button>
                        <button type="button" onClick={() => downloadQrCode(collection)} className="px-2.5 py-1.5 rounded-md border border-ink-dark/20 bg-white text-xs hover:border-sdu-red">下载二维码</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!collections.length && <p className="text-sm text-ink-light">暂无专题，请先创建。</p>}
          </div>
        </aside>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-xl font-serif font-bold">{selectedCollection?.title ?? '请选择专题'}</h3>
              <p className="text-sm text-ink-light mt-1">{selectedCollection?.description ?? '在左侧选择专题后，可管理题目、排序和批量导入。'}</p>
            </div>
            {selectedCollection && <p className="text-sm text-ink-light">当前专题共 {selectedCollection.question_count} 道题</p>}
          </div>

          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按题干、选项或解析搜索..."
            className="w-full mb-4 px-4 py-3 rounded-lg border border-ink-dark/20"
          />
          <p className="text-xs text-ink-light mb-4">CSV 格式：prompt,options,correct_index,points,explanation,order_index，其中 options 用 | 分隔、correct_index 为 0-based（0=第一个选项）；order_index 可留空自动追加并重排。</p>

          {importReport && (
            <div className="mb-4 rounded-2xl border border-ink-dark/10 bg-paper-bg/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <p className="font-medium text-ink-dark">最近一次导入：{importReport.collection_title}</p>
                  <p className="text-xs text-ink-light mt-1">总行数 {importReport.total_rows} · 新增 {importReport.created} · 跳过 {importReport.skipped}</p>
                </div>
                <span className={importReport.skipped > 0 ? 'text-xs rounded-full px-3 py-1 bg-amber-100 text-amber-700' : 'text-xs rounded-full px-3 py-1 bg-green-100 text-green-700'}>
                  {importReport.skipped > 0 ? '部分成功' : '全部成功'}
                </span>
              </div>

              {!!importReport.issues.length && (
                <div className="overflow-x-auto border border-ink-dark/10 rounded-lg bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left">
                      <tr>
                        <th className="px-3 py-2">行号</th>
                        <th className="px-3 py-2">题干</th>
                        <th className="px-3 py-2">原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importReport.issues.map((issue) => (
                        <tr key={`${issue.row_number}-${issue.error}`} className="border-t border-ink-dark/10 align-top">
                          <td className="px-3 py-2 text-ink-light">{issue.row_number}</td>
                          <td className="px-3 py-2 max-w-sm">{issue.prompt || '—'}</td>
                          <td className="px-3 py-2 text-red-700">{issue.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto border border-ink-dark/10 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">序号</th>
                  <th className="px-3 py-2">题干</th>
                  <th className="px-3 py-2">类型</th>
                  <th className="px-3 py-2">分值</th>
                  <th className="px-3 py-2">更新时间</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuestions.map((q) => (
                  <tr key={q.id} className="border-t border-ink-dark/10 align-top">
                    <td className="px-3 py-2 text-ink-light">#{q.order_index}</td>
                    <td className="px-3 py-2 max-w-xl">
                      <p className="font-medium line-clamp-2">{q.prompt}</p>
                      {!!q.explanation && <p className="text-xs text-ink-light mt-1 line-clamp-2">解析：{q.explanation}</p>}
                    </td>
                    <td className="px-3 py-2 text-ink-light">{q.question_type}</td>
                    <td className="px-3 py-2 text-ink-light">{q.points}</td>
                    <td className="px-3 py-2 text-ink-light">{new Date(q.updated_at).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditDrawer(q)}
                          className="px-3 py-1.5 rounded-md bg-sdu-red text-white hover:bg-sdu-red-hover"
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
                    <td colSpan={6} className="px-3 py-6 text-center text-ink-light">暂无匹配题目</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-ink-light mt-3">加载中...</p>}

      {notice && (
        <InlineNotice
          message={notice.msg}
          type={notice.type}
          className="mt-4"
        />
      )}

      {collectionDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={resetCollectionDrawer} />
          <div className="w-full max-w-lg bg-white h-full overflow-y-auto border-l border-ink-dark/10 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-serif font-bold">{editingCollectionId ? '编辑专题' : '新增专题'}</h3>
              <button type="button" onClick={resetCollectionDrawer} className="text-ink-light hover:text-ink-dark">关闭</button>
            </div>

            <form onSubmit={createOrUpdateCollection} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">专题名称</label>
                <input
                  type="text"
                  value={collectionForm.title}
                  onChange={(e) => setCollectionForm((prev) => ({ ...prev, title: e.target.value }))}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-ink-dark/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">专题说明</label>
                <textarea
                  rows={4}
                  value={collectionForm.description}
                  onChange={(e) => setCollectionForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg border border-ink-dark/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">排序</label>
                  <input
                    type="number"
                    min={0}
                    value={collectionForm.sort_order}
                    onChange={(e) => setCollectionForm((prev) => ({ ...prev, sort_order: Number(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 rounded-lg border border-ink-dark/20"
                  />
                </div>
                <label className="flex items-center gap-3 pt-8">
                  <input
                    type="checkbox"
                    checked={collectionForm.is_published}
                    onChange={(e) => setCollectionForm((prev) => ({ ...prev, is_published: e.target.checked }))}
                  />
                  <span className="text-sm">发布到用户端</span>
                </label>
              </div>
              <button className="w-full py-3 bg-sdu-red text-white rounded-lg hover:bg-sdu-red-hover transition-colors">
                {editingCollectionId ? '保存专题' : '创建专题'}
              </button>
            </form>
          </div>
        </div>
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
                  className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:ring-2 focus:ring-sdu-red/40 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">所属专题</label>
                  <select
                    value={form.collection_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, collection_id: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-ink-dark/20"
                    required
                  >
                    <option value="">请选择专题</option>
                    {collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>{collection.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">排序序号</label>
                  <input
                    type="number"
                    min={1}
                    value={form.order_index}
                    onChange={(e) => setForm((prev) => ({ ...prev, order_index: Number(e.target.value) || 1 }))}
                    className="w-full px-4 py-3 rounded-lg border border-ink-dark/20"
                  />
                  <p className="text-xs text-ink-light mt-1">编号从 1 开始；若与现有编号冲突，系统会自动重排。</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                <div />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">选项动态管理</label>
                  <button type="button" onClick={addOption} className="text-sm text-sdu-red hover:underline">添加选项</button>
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

              <button className="w-full py-3 bg-sdu-red text-white rounded-lg hover:bg-sdu-red-hover transition-colors">
                {editingId ? '保存修改' : '创建题目'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
