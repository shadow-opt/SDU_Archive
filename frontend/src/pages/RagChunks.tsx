import { useEffect, useMemo, useState } from 'react';
import { apiBase, getAuthHeaders, parseApiError } from '../services/api';
import InlineNotice from '../components/InlineNotice';

type Chunk = {
  id: string;
  document_id: string;
  document_title?: string;
  content: string;
  source_url: string;
  char_count?: number;
  token_count?: number;
  created_at: string;
  updated_at: string;
};

export default function RagChunks() {
  const pageSize = 20;
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Chunk | null>(null);
  const [content, setContent] = useState('');
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadChunks = async (nextSkip = 0, nextKeyword = appliedKeyword, append = false) => {
    setLoading(true);
    setNotice(null);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        skip: String(nextSkip),
      });
      if (nextKeyword.trim()) {
        params.set('q', nextKeyword.trim());
      }

      const res = await fetch(`${apiBase}/api/chunks/?${params.toString()}`, {
        headers: getAuthHeaders(true),
      });
      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, '加载切片失败'), type: 'error' });
        return;
      }
      const data = (await res.json()) as { items: Chunk[]; total: number };
      setChunks((prev) => (append ? [...prev, ...data.items] : data.items));
      setTotal(data.total);
      setSkip(nextSkip);
      setHasMore(nextSkip + data.items.length < data.total);
    } catch {
      setNotice({ msg: '加载切片失败，请稍后重试', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadChunks(0, '', false);
  }, []);

  const openEditor = (chunk: Chunk) => {
    setSelected(chunk);
    setContent(chunk.content);
    setNotice(null);
  };

  const saveChunk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;

    setNotice({ msg: '保存中...', type: 'info' });
    try {
      const res = await fetch(`${apiBase}/api/chunks/${selected.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, '保存失败'), type: 'error' });
        return;
      }
      setNotice({ msg: '切片已更新并重嵌入', type: 'success' });
      setSelected(null);
      await loadChunks(skip, appliedKeyword, false);
    } catch {
      setNotice({ msg: '保存失败，请稍后重试', type: 'error' });
    }
  };

  const deleteChunk = async () => {
    if (!selected) return;
    if (!window.confirm('确定要删除该切片吗？此操作不可恢复。')) return;
    setNotice({ msg: '删除中...', type: 'info' });

    try {
      const res = await fetch(`${apiBase}/api/chunks/${selected.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(true),
      });
      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, '删除失败'), type: 'error' });
        return;
      }
      setNotice({ msg: '切片已删除', type: 'success' });
      setSelected(null);
      setContent('');
      await loadChunks(0, appliedKeyword, false);
    } catch {
      setNotice({ msg: '删除失败，请稍后重试', type: 'error' });
    }
  };

  const applySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyword.trim();
    setAppliedKeyword(trimmed);
    await loadChunks(0, trimmed, false);
  };

  const loadMore = async () => {
    if (loading || !hasMore) return;
    const nextSkip = skip + pageSize;
    await loadChunks(nextSkip, appliedKeyword, true);
  };

  const tableRows = useMemo(() => {
    return chunks.map((chunk) => ({
      ...chunk,
      preview: chunk.content.length > 110 ? `${chunk.content.slice(0, 110)}...` : chunk.content,
    }));
  }, [chunks]);

  return (
    <div className="bg-white rounded-2xl border border-ink-dark/10 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl font-serif font-bold">RAG 知识切片干预台</h2>
        <button onClick={() => void loadChunks(0, appliedKeyword, false)} className="text-sm px-3 py-2 rounded-md border border-ink-dark/20 hover:border-sdu-red">
          刷新
        </button>
      </div>

      <form onSubmit={applySearch} className="mb-4 flex gap-2">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="按关键词检索切片内容或来源"
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-ink-dark/20"
        />
        <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-sdu-red text-white hover:bg-sdu-red-hover">
          搜索
        </button>
      </form>

      <div className="overflow-x-auto border border-ink-dark/10 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">源文档名</th>
              <th className="px-3 py-2">切片内容预览</th>
              <th className="px-3 py-2">字数/Token</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((chunk) => (
              <tr key={chunk.id} className="border-t border-ink-dark/10 align-top">
                <td className="px-3 py-2 text-ink-light w-52">{chunk.document_title || '未命名文档'}</td>
                <td className="px-3 py-2">
                  <p className="font-mono text-xs text-ink-light mb-1">{chunk.id}</p>
                  <p>{chunk.preview}</p>
                </td>
                <td className="px-3 py-2 w-28 text-ink-light">{chunk.char_count ?? chunk.content.length} / {chunk.token_count ?? Math.max(1, Math.floor(chunk.content.length / 4))}</td>
                <td className="px-3 py-2 w-36">
                  <button
                    type="button"
                    onClick={() => openEditor(chunk)}
                    className="px-3 py-1.5 rounded-md bg-sdu-red text-white hover:bg-sdu-red-hover"
                  >
                    编辑
                  </button>
                </td>
              </tr>
            ))}
            {!loading && !tableRows.length && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-ink-light">暂无切片数据</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {chunks.length > 0 && (
        <div className="pt-3 flex items-center justify-between">
          <span className="text-xs text-ink-light">共 {total} 条，已加载 {chunks.length} 条</span>
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={!hasMore || loading}
            className="px-4 py-2 text-sm rounded-lg border border-ink-dark/20 hover:border-sdu-red disabled:opacity-50"
          >
            {hasMore ? '加载更多' : '没有更多了'}
          </button>
        </div>
      )}

      {notice && (
        <InlineNotice
          message={notice.msg}
          type={notice.type}
          className="mt-4"
        />
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-xl p-6 border border-ink-dark/10">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-xl font-serif font-bold">编辑切片</h3>
                <p className="text-sm text-ink-light">{selected.document_title || selected.source_url}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-ink-light hover:text-ink-dark">关闭</button>
            </div>
            <form onSubmit={saveChunk} className="space-y-4">
              <textarea
                rows={14}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-ink-dark/20 focus:ring-2 focus:ring-sdu-red/40 focus:outline-none"
              />
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => void deleteChunk()}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  删除
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sdu-red text-white rounded-lg hover:bg-sdu-red-hover transition-colors"
                >
                  保存并重嵌入
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {loading && <p className="text-sm text-ink-light mt-3">加载中...</p>}
    </div>
  );
}
