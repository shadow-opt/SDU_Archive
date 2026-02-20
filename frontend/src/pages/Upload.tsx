import { useMemo, useState } from 'react';
import { apiBase, getAuthToken, parseApiError } from '../services/api';
import InlineNotice from '../components/InlineNotice';

type UploadStage = 'pending' | 'uploading' | 'chunking' | 'embedding' | 'done' | 'error';

type UploadTask = {
  id: string;
  file: File;
  stage: UploadStage;
  message: string;
};

export default function Upload() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [yearOrPeriod, setYearOrPeriod] = useState('');
  const [docType, setDocType] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [status, setStatus] = useState('');
  const [uploading, setUploading] = useState(false);

  const totalSizeMb = useMemo(() => files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024, [files]);

  const updateTask = (id: string, patch: Partial<UploadTask>) => {
    setTasks((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const pickFiles = (selected: FileList | null) => {
    if (!selected) return;
    const next = Array.from(selected);
    const tooLarge = next.find((f) => f.size > 100 * 1024 * 1024);
    if (tooLarge) {
      setStatus(`文件 ${tooLarge.name} 超过 100MB 限制`);
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

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) return;
    
    setStatus('上传任务进行中...');
    const token = getAuthToken();
    if (!token) {
      setStatus('请先登录管理员账号');
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

        updateTask(task.id, { stage: 'chunking', message: '文本切分中...' });
        await sleep(400);
        updateTask(task.id, { stage: 'embedding', message: '向量化入库中...' });
        await sleep(500);
        updateTask(task.id, { stage: 'done', message: '完成' });
        successCount += 1;
      }

      setStatus(`任务完成：${successCount}/${tasks.length} 个文件成功`);
      setTitle('');
      setDescription('');
      setYearOrPeriod('');
      setDocType('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '上传失败');
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
              className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:ring-2 focus:ring-[#9C0C13]/50 focus:border-[#9C0C13] transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-dark mb-2">发生年份/时期</label>
            <input
              type="text"
              value={yearOrPeriod}
              onChange={(e) => setYearOrPeriod(e.target.value)}
              placeholder="如：1921-1927 或 改革开放初期"
              className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:ring-2 focus:ring-[#9C0C13]/50 focus:border-[#9C0C13] transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-dark mb-2">文档类型</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:ring-2 focus:ring-[#9C0C13]/50 focus:border-[#9C0C13] transition-colors"
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
            className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:ring-2 focus:ring-[#9C0C13]/50 focus:border-[#9C0C13] transition-colors resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-dark mb-2">选择文件 (单文件最大 100MB，可多选)</label>
          <div
            className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-ink-dark/20 border-dashed rounded-lg hover:border-[#9C0C13]/50 transition-colors bg-paper-bg/50"
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
                <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-[#9C0C13] hover:text-[#7d0a10] focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-[#9C0C13]">
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

        {status && <InlineNotice message={status} type={status.includes('成功') ? 'success' : 'error'} />}

        <button
          type="submit"
          disabled={!files.length || uploading}
          className="w-full py-3 bg-[#9C0C13] text-white rounded-lg font-medium hover:bg-[#7d0a10] transition-colors disabled:opacity-50"
        >
          {uploading ? '处理中...' : '上传并切片'}
        </button>
      </form>
    </div>
  );
}
