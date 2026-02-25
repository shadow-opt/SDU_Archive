import { useEffect, useMemo, useState } from 'react';
import { apiBase, getAuthToken, getAuthHeaders, parseApiError } from '../services/api';
import InlineNotice from '../components/InlineNotice';

type UploadStage = 'pending' | 'uploading' | 'chunking' | 'embedding' | 'done' | 'error';

type UploadTask = {
  id: string;
  file: File;
  stage: UploadStage;
  message: string;
};

type DocItem = {
  id: string;
  title: string;
  filename: string;
  content_type: string;
  doc_type?: string;
  year_or_period?: string;
  created_at: string;
};

export default function Upload() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [yearOrPeriod, setYearOrPeriod] = useState('');
  const [docType, setDocType] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Document list state
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [docsTotal, setDocsTotal] = useState(0);
  const [docsSkip, setDocsSkip] = useState(0);
  const docsPageSize = 10;
  const [docsLoading, setDocsLoading] = useState(false);

  const fetchDocs = async (nextSkip = 0) => {
    setDocsLoading(true);
    try {
      const params = new URLSearchParams({ skip: String(nextSkip), limit: String(docsPageSize) });
      const res = await fetch(`${apiBase}/api/documents/?${params}`, { headers: getAuthHeaders(true) });
      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, '加载文档列表失败'), type: 'error' });
        return;
      }
      const data = (await res.json()) as { items: DocItem[]; total: number };
      setDocs(data.items);
      setDocsTotal(data.total);
      setDocsSkip(nextSkip);
    } catch {
      setNotice({ msg: '加载文档列表失败，请稍后重试', type: 'error' });
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => { void fetchDocs(); }, []);

  const deleteDoc = async (docId: string) => {
    if (!window.confirm('确定要删除该文档及其所有切片吗？此操作不可恢复。')) return;
    try {
      const res = await fetch(`${apiBase}/api/documents/${docId}`, { method: 'DELETE', headers: getAuthHeaders(true) });
      if (!res.ok) { setNotice({ msg: await parseApiError(res, '删除失败'), type: 'error' }); return; }
      setNotice({ msg: '文档已删除', type: 'success' });
      await fetchDocs(docsSkip);
    } catch { setNotice({ msg: '删除失败', type: 'error' }); }
  };

  const totalSizeMb = useMemo(() => files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024, [files]);

  const updateTask = (id: string, patch: Partial<UploadTask>) => {
    setTasks((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const pickFiles = (selected: FileList | null) => {
    if (!selected) return;
    const next = Array.from(selected);
    const tooLarge = next.find((f) => f.size > 100 * 1024 * 1024);
    if (tooLarge) {
      setNotice({ msg: `文件 ${tooLarge.name} 超过 100MB 限制`, type: 'error' });
      return;
    }
    setFiles(next);
    setTasks(
      next.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        stage: 'pending',
        message: '等待上传',
      }))
    );
  };

  // const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) return;
    
    setNotice({ msg: '上传任务进行中...', type: 'info' });
    const token = getAuthToken();
    if (!token) {
      setNotice({ msg: '请先登录管理员账号', type: 'error' });
      return;
    }
    setUploading(true);

    try {
      let successCount = 0;
      for (const task of tasks) {
        updateTask(task.id, { stage: 'uploading', message: '文件上传中...' });
        const form = new FormData();
        form.append('title', title || task.file.name);
        form.append('description', description);
        form.append('year_or_period', yearOrPeriod);
        form.append('doc_type', docType);
        form.append('file', task.file);

        const res = await fetch(`${apiBase}/api/documents/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        });

        if (!res.ok) {
          updateTask(task.id, { stage: 'error', message: await parseApiError(res, '上传失败') });
          continue;
        }

        // Server completes chunking + embedding before responding;
        // mark as done immediately.
        updateTask(task.id, { stage: 'done', message: '完成' });
        successCount += 1;
      }

      const failedCount = tasks.length - successCount;
      const noticeType: 'success' | 'error' | 'info' =
        successCount === tasks.length ? 'success' : successCount > 0 ? 'info' : 'error';
      const noticeMsg =
        failedCount === 0
          ? `任务完成：${successCount}/${tasks.length} 个文件成功`
          : `任务部分完成：成功 ${successCount} 个，失败 ${failedCount} 个`;
      setNotice({ msg: noticeMsg, type: noticeType });
      setTitle('');
      setDescription('');
      setYearOrPeriod('');
      setDocType('');
      await fetchDocs(0);
    } catch (err) {
      setNotice({ msg: err instanceof Error ? err.message : '上传失败', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-ink-dark/5">
      <h2 className="text-2xl font-serif font-bold text-ink-dark mb-6">档案上传与切片</h2>
      <p className="text-ink-light mb-8">RAG 知识注入中心：上传后执行“文件上传 → 文本切分 → 向量化入库”流程。</p>

      <form onSubmit={handleUpload} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-dark mb-2">文档标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="留空则使用文件名"
              className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:ring-2 focus:ring-sdu-red/50 focus:border-sdu-red transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-dark mb-2">发生年份/时期</label>
            <input
              type="text"
              value={yearOrPeriod}
              onChange={(e) => setYearOrPeriod(e.target.value)}
              placeholder="如：1921-1927 或 改革开放初期"
              className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:ring-2 focus:ring-sdu-red/50 focus:border-sdu-red transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-dark mb-2">文档类型</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:ring-2 focus:ring-sdu-red/50 focus:border-sdu-red transition-colors"
          >
            <option value="">请选择类型</option>
            <option value="official">官方文稿</option>
            <option value="memoir">口述/回忆录</option>
            <option value="image">图片资料</option>
            <option value="newspaper">报刊摘录</option>
            <option value="other">其他</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-dark mb-2">文档描述 (可选)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="为图片补充文字描述，以便更好地被检索..."
            rows={4}
            className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:ring-2 focus:ring-sdu-red/50 focus:border-sdu-red transition-colors resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-dark mb-2">选择文件 (单文件最大 100MB，可多选)</label>
          <div
            className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-ink-dark/20 border-dashed rounded-lg hover:border-sdu-red/50 transition-colors bg-paper-bg/50"
            onDrop={(e) => {
              e.preventDefault();
              pickFiles(e.dataTransfer.files);
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="space-y-1 text-center">
              <svg className="mx-auto h-12 w-12 text-ink-light" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex text-sm text-ink-dark justify-center">
                <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-sdu-red hover:text-sdu-red-hover focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-sdu-red">
                  <span>上传文件</span>
                  <input id="file-upload" name="file-upload" type="file" multiple className="sr-only" onChange={(e) => pickFiles(e.target.files)} />
                </label>
                <p className="pl-1">或拖拽至此处</p>
              </div>
              <p className="text-xs text-ink-light">
                {files.length ? `已选择 ${files.length} 个文件，总计 ${totalSizeMb.toFixed(2)} MB` : '支持 PDF, PNG, JPG, TXT'}
              </p>
            </div>
          </div>
        </div>

        {!!tasks.length && (
          <div className="rounded-lg border border-ink-dark/10 divide-y divide-ink-dark/10">
            {tasks.map((task) => (
              <div key={task.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{task.file.name}</p>
                  <p className="text-xs text-ink-light">{task.message}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${task.stage === 'done' ? 'bg-green-100 text-green-700' : task.stage === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  {task.stage === 'pending' && '等待中'}
                  {task.stage === 'uploading' && '上传中'}
                  {task.stage === 'chunking' && '切分中'}
                  {task.stage === 'embedding' && '向量化'}
                  {task.stage === 'done' && '完成'}
                  {task.stage === 'error' && '失败'}
                </span>
              </div>
            ))}
          </div>
        )}

        {notice && <InlineNotice message={notice.msg} type={notice.type} />}

        <button
          type="submit"
          disabled={!files.length || uploading}
          className="w-full py-3 bg-sdu-red text-white rounded-lg font-medium hover:bg-sdu-red-hover transition-colors disabled:opacity-50"
        >
          {uploading ? '处理中...' : '上传并切片'}
        </button>
      </form>

      {/* ── Document list ────────────────────────────────────────── */}
      <div className="mt-10 border-t border-ink-dark/10 pt-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-serif font-bold text-ink-dark">已上传文档</h3>
          <span className="text-xs text-ink-light">共 {docsTotal} 条</span>
        </div>

        <div className="overflow-x-auto border border-ink-dark/10 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">标题</th>
                <th className="px-3 py-2">文件名</th>
                <th className="px-3 py-2">类型</th>
                <th className="px-3 py-2">时期</th>
                <th className="px-3 py-2">上传时间</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} className="border-t border-ink-dark/10">
                  <td className="px-3 py-2 font-medium">{doc.title}</td>
                  <td className="px-3 py-2 text-ink-light truncate max-w-[200px]">{doc.filename}</td>
                  <td className="px-3 py-2 text-ink-light">{doc.doc_type || '-'}</td>
                  <td className="px-3 py-2 text-ink-light">{doc.year_or_period || '-'}</td>
                  <td className="px-3 py-2 text-ink-light">{new Date(doc.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void deleteDoc(doc.id)}
                      className="px-3 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {!docsLoading && !docs.length && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-ink-light">暂无文档</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {docsTotal > docsPageSize && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-ink-light">{docsSkip + 1}-{Math.min(docsSkip + docsPageSize, docsTotal)} / {docsTotal}</span>
            <div className="flex gap-2">
              <button type="button" disabled={docsSkip === 0 || docsLoading} onClick={() => void fetchDocs(Math.max(docsSkip - docsPageSize, 0))} className="px-3 py-1.5 text-sm rounded border border-ink-dark/20 disabled:opacity-50">上一页</button>
              <button type="button" disabled={docsSkip + docsPageSize >= docsTotal || docsLoading} onClick={() => void fetchDocs(docsSkip + docsPageSize)} className="px-3 py-1.5 text-sm rounded border border-ink-dark/20 disabled:opacity-50">下一页</button>
            </div>
          </div>
        )}
        {docsLoading && <p className="text-sm text-ink-light mt-2">加载中...</p>}
      </div>
    </div>
  );
}
