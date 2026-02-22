import { useEffect, useMemo, useState } from 'react';
import { apiBase, getAuthHeaders, parseApiError } from '../services/api';
import InlineNotice from '../components/InlineNotice';

type UserItem = {
  id: string;
  email: string;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
};

type UserListResponse = {
  items: UserItem[];
  total: number;
  skip: number;
  limit: number;
};

export default function AdminUsers() {
  const pageSize = 20;

  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);

  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');

  const [selected, setSelected] = useState<UserItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [newStatus, setNewStatus] = useState(true);
  const [newPassword, setNewPassword] = useState('');

  const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loading, setLoading] = useState(false);

  // ─── Create user modal ────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<'admin' | 'user'>('user');
  const [creating, setCreating] = useState(false);

  const hasPrev = skip > 0;
  const hasNext = skip + pageSize < total;

  const fetchUsers = async (nextSkip = skip, nextKeyword = appliedKeyword) => {
    setLoading(true);
    setNotice(null);

    const params = new URLSearchParams({
      skip: String(nextSkip),
      limit: String(pageSize),
    });
    if (nextKeyword.trim()) params.set('q', nextKeyword.trim());
    if (role) params.set('role', role);
    if (active) params.set('is_active', active);

    try {
      const res = await fetch(`${apiBase}/api/admin/users?${params.toString()}`, {
        headers: getAuthHeaders(true),
      });
      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, '加载用户失败'), type: 'error' });
        return;
      }
      const payload = (await res.json()) as UserListResponse;
      setUsers(payload.items);
      setTotal(payload.total);
      setSkip(payload.skip);
    } catch {
      setNotice({ msg: '加载用户失败，请稍后重试', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers(0, '');
  }, []);

  const applySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = keyword.trim();
    setAppliedKeyword(q);
    await fetchUsers(0, q);
  };

  const openDrawer = (user: UserItem) => {
    setSelected(user);
    setNewRole(user.role);
    setNewStatus(user.is_active);
    setNewPassword('');
    setDrawerOpen(true);
    setNotice(null);
  };

  const refresh = async () => {
    await fetchUsers(skip, appliedKeyword);
  };

  const updateRole = async () => {
    if (!selected) return;
    setNotice({ msg: '角色更新中...', type: 'info' });
    try {
      const res = await fetch(`${apiBase}/api/admin/users/${selected.id}/role`, {
        method: 'PATCH',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, '角色更新失败'), type: 'error' });
        return;
      }
      setNotice({ msg: '角色已更新', type: 'success' });
      await refresh();
    } catch {
      setNotice({ msg: '角色更新失败，请稍后重试', type: 'error' });
    }
  };

  const updateStatus = async () => {
    if (!selected) return;
    setNotice({ msg: '状态更新中...', type: 'info' });
    try {
      const res = await fetch(`${apiBase}/api/admin/users/${selected.id}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ is_active: newStatus }),
      });
      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, '状态更新失败'), type: 'error' });
        return;
      }
      setNotice({ msg: '账号状态已更新', type: 'success' });
      await refresh();
    } catch {
      setNotice({ msg: '状态更新失败，请稍后重试', type: 'error' });
    }
  };

  const resetPassword = async () => {
    if (!selected) return;
    if (newPassword.length < 8) {
      setNotice({ msg: '新密码至少 8 位', type: 'error' });
      return;
    }
    setNotice({ msg: '重置密码中...', type: 'info' });
    try {
      const res = await fetch(`${apiBase}/api/admin/users/${selected.id}/reset-password`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ new_password: newPassword }),
      });
      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, '重置密码失败'), type: 'error' });
        return;
      }
      setNotice({ msg: '密码已重置', type: 'success' });
      setNewPassword('');
    } catch {
      setNotice({ msg: '重置密码失败，请稍后重试', type: 'error' });
    }
  };

  const showingRange = useMemo(() => {
    if (!total) return '0 / 0';
    const from = skip + 1;
    const to = Math.min(skip + pageSize, total);
    return `${from}-${to} / ${total}`;
  }, [skip, pageSize, total]);

  const createUser = async () => {
    if (!createEmail.trim() || createPassword.length < 8) {
      setNotice({ msg: '请输入有效邮箱和至少 8 位密码', type: 'error' });
      return;
    }
    setCreating(true);
    setNotice({ msg: '创建用户中...', type: 'info' });
    try {
      const res = await fetch(`${apiBase}/api/admin/users`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ email: createEmail, password: createPassword, role: createRole }),
      });
      if (!res.ok) {
        setNotice({ msg: await parseApiError(res, '创建用户失败'), type: 'error' });
        return;
      }
      setNotice({ msg: '用户已创建', type: 'success' });
      setCreateOpen(false);
      setCreateEmail('');
      setCreatePassword('');
      setCreateRole('user');
      await refresh();
    } catch {
      setNotice({ msg: '创建用户失败，请稍后重试', type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-ink-dark/10 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl font-serif font-bold">用户管理</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setCreateOpen(true)} className="px-3 py-2 rounded-md bg-sdu-red text-white hover:bg-sdu-red-hover text-sm">
            + 新建用户
          </button>
          <button type="button" onClick={() => void refresh()} className="px-3 py-2 rounded-md border border-ink-dark/20 hover:border-sdu-red text-sm">
            刷新
          </button>
        </div>
      </div>

      <form onSubmit={applySearch} className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="按邮箱关键词搜索"
          className="md:col-span-2 px-3 py-2 rounded-lg border border-ink-dark/20"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="px-3 py-2 rounded-lg border border-ink-dark/20">
          <option value="">全部角色</option>
          <option value="admin">admin</option>
          <option value="user">user</option>
        </select>
        <select value={active} onChange={(e) => setActive(e.target.value)} className="px-3 py-2 rounded-lg border border-ink-dark/20">
          <option value="">全部状态</option>
          <option value="true">启用</option>
          <option value="false">停用</option>
        </select>
        <button className="md:col-span-4 py-2 rounded-lg bg-sdu-red text-white hover:bg-sdu-red-hover">查询</button>
      </form>

      <div className="overflow-x-auto border border-ink-dark/10 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">邮箱</th>
              <th className="px-3 py-2">角色</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">创建时间</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-ink-dark/10">
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.role}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.is_active ? '启用' : '停用'}
                  </span>
                </td>
                <td className="px-3 py-2 text-ink-light">{new Date(u.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => openDrawer(u)} className="px-3 py-1.5 rounded-md bg-sdu-red text-white hover:bg-sdu-red-hover">
                    管理
                  </button>
                </td>
              </tr>
            ))}
            {!loading && !users.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-ink-light">暂无用户数据</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-ink-light">{showingRange}</span>
        <div className="flex gap-2">
          <button type="button" disabled={!hasPrev || loading} onClick={() => void fetchUsers(Math.max(skip - pageSize, 0), appliedKeyword)} className="px-3 py-1.5 text-sm rounded border border-ink-dark/20 disabled:opacity-50">
            上一页
          </button>
          <button type="button" disabled={!hasNext || loading} onClick={() => void fetchUsers(skip + pageSize, appliedKeyword)} className="px-3 py-1.5 text-sm rounded border border-ink-dark/20 disabled:opacity-50">
            下一页
          </button>
        </div>
      </div>

      {notice && (
        <InlineNotice
          message={notice.msg}
          type={notice.type}
          className="mt-4"
        />
      )}

      {drawerOpen && selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-xl bg-white h-full overflow-y-auto border-l border-ink-dark/10 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-serif font-bold">管理用户</h3>
              <button type="button" onClick={() => setDrawerOpen(false)} className="text-ink-light hover:text-ink-dark">关闭</button>
            </div>

            <div className="space-y-4">
              <div className="text-sm text-ink-light">邮箱：{selected.email}</div>
              <div className="text-sm text-ink-light">创建时间：{new Date(selected.created_at).toLocaleString()}</div>

              <div className="pt-2 border-t border-ink-dark/10">
                <label className="block text-sm font-medium mb-1">角色</label>
                <div className="flex gap-2">
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')} className="flex-1 px-3 py-2 rounded-lg border border-ink-dark/20">
                    <option value="admin">admin</option>
                    <option value="user">user</option>
                  </select>
                  <button type="button" onClick={() => void updateRole()} className="px-3 py-2 rounded-lg bg-sdu-red text-white hover:bg-sdu-red-hover">保存</button>
                </div>
              </div>

              <div className="pt-2 border-t border-ink-dark/10">
                <label className="block text-sm font-medium mb-1">账号状态</label>
                <div className="flex gap-2">
                  <select value={String(newStatus)} onChange={(e) => setNewStatus(e.target.value === 'true')} className="flex-1 px-3 py-2 rounded-lg border border-ink-dark/20">
                    <option value="true">启用</option>
                    <option value="false">停用</option>
                  </select>
                  <button type="button" onClick={() => void updateStatus()} className="px-3 py-2 rounded-lg bg-sdu-red text-white hover:bg-sdu-red-hover">保存</button>
                </div>
              </div>

              <div className="pt-2 border-t border-ink-dark/10">
                <label className="block text-sm font-medium mb-1">重置密码</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="新密码（至少 8 位）"
                    className="flex-1 px-3 py-2 rounded-lg border border-ink-dark/20"
                  />
                  <button type="button" onClick={() => void resetPassword()} className="px-3 py-2 rounded-lg bg-sdu-red text-white hover:bg-sdu-red-hover">重置</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Create user modal ─── */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setCreateOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-lg w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-serif font-bold">新建用户</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="text-ink-light hover:text-ink-dark">关闭</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">邮箱</label>
                <input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 rounded-lg border border-ink-dark/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">密码</label>
                <input
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="至少 8 位"
                  className="w-full px-3 py-2 rounded-lg border border-ink-dark/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">角色</label>
                <select value={createRole} onChange={(e) => setCreateRole(e.target.value as 'admin' | 'user')} className="w-full px-3 py-2 rounded-lg border border-ink-dark/20">
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={() => void createUser()}
                className="w-full py-2 bg-sdu-red text-white rounded-lg hover:bg-sdu-red-hover disabled:opacity-50"
              >
                {creating ? '创建中...' : '创建用户'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
