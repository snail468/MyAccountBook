'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatShort } from '@/lib/datetime';

type U = {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  entryCount: number;
  eventCount: number;
};

export default function AdminUserList({
  currentUserId,
  users,
}: {
  currentUserId: string;
  users: U[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setShowCreate(false);
    setUsername('');
    setPassword('');
    setRole('user');
    setError('');
  }

  async function create() {
    setError('');
    if (!username.trim() || password.length < 6) {
      setError('用户名 ≥ 2 字符，密码 ≥ 6 位');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建失败');
      reset();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }

  async function delUser(id: string, name: string) {
    if (!confirm(`删除用户 "${name}"？该用户的所有账本数据会一并清除，且不可恢复！`)) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.ok) startTransition(() => router.refresh());
    else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '删除失败');
    }
  }

  async function toggleRole(u: U) {
    const next = u.role === 'admin' ? 'user' : 'admin';
    const verb = next === 'admin' ? '升为管理员' : '降级为普通用户';
    if (!confirm(`确定把 "${u.username}" ${verb}？`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: next }),
    });
    if (res.ok) startTransition(() => router.refresh());
    else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '操作失败');
    }
  }

  async function resetPwd(u: U) {
    const newPwd = prompt(`为 "${u.username}" 输入新密码 (≥ 6 位)`);
    if (!newPwd || newPwd.length < 6) {
      if (newPwd !== null) alert('密码至少 6 位');
      return;
    }
    if (
      !confirm(
        `确定把 "${u.username}" 的密码重置吗？\n\n新密码：${newPwd}\n\n对方需要用这个新密码登录`,
      )
    )
      return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPwd }),
    });
    if (res.ok) alert('已重置');
    else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '重置失败');
    }
  }

  return (
    <>
      <button
        onClick={() => setShowCreate(true)}
        className="w-full py-4 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 font-medium mb-4"
      >
        + 新建用户
      </button>

      <div className="space-y-2">
        {users.map((u) => {
          const isSelf = u.id === currentUserId;
          return (
            <div
              key={u.id}
              className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700"
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-medium">{u.username}</span>
                {u.role === 'admin' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    管理员
                  </span>
                )}
                {isSelf && <span className="text-[10px] text-ink-400">（我）</span>}
              </div>
              <div className="text-[11px] text-ink-500 mt-1">
                {formatShort(u.createdAt)} · {u.entryCount} 条工作记账 · {u.eventCount} 个活动
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                <button
                  onClick={() => resetPwd(u)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-ink-50 dark:bg-ink-700"
                >
                  重置密码
                </button>
                <button
                  onClick={() => toggleRole(u)}
                  disabled={isSelf}
                  className="text-xs px-3 py-1.5 rounded-lg bg-ink-50 dark:bg-ink-700 disabled:opacity-30"
                >
                  {u.role === 'admin' ? '降级为普通用户' : '升为管理员'}
                </button>
                <button
                  onClick={() => delUser(u.id, u.username)}
                  disabled={isSelf}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 disabled:opacity-30"
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={reset}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium mb-4">新建用户</h3>
            <input
              autoFocus
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={2}
              maxLength={32}
              className="w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
            />
            <input
              type="password"
              placeholder="密码 (≥ 6 位)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              className="mt-3 w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setRole('user')}
                className={`flex-1 py-3 rounded-2xl ${role === 'user' ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900' : 'bg-ink-50 dark:bg-ink-800'}`}
              >
                普通用户
              </button>
              <button
                onClick={() => setRole('admin')}
                className={`flex-1 py-3 rounded-2xl ${role === 'admin' ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900' : 'bg-ink-50 dark:bg-ink-800'}`}
              >
                管理员
              </button>
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={reset} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
                取消
              </button>
              <button
                onClick={create}
                disabled={busy}
                className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
              >
                {busy ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
