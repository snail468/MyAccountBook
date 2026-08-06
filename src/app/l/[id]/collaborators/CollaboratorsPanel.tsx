'use client';

// 账本协作面板（B7）。
//
// owner：能生成邀请码、撤回未使用的邀请、改成员角色（editor/viewer 互切）、
//        踢人（不能踢最后一个 owner）。
// editor / viewer：只能看到自己和其他成员，能"主动退出"（把自己踢出）。
//
// 邀请链接：/invite/<token>。owner 生成后一键复制。
// 首次加载数据由 server component 直接拉，交互后走 API 增量刷新（简单 refresh）。

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ui/Dialog';

type Member = { userId: string; username: string; role: string; createdAt: string };
type Invite = {
  id: string;
  token: string;
  role: string;
  createdAt: string;
  expiresAt: string | null;
};

const roleLabel = (r: string) =>
  r === 'owner' ? '拥有者' : r === 'editor' ? '编辑者' : r === 'viewer' ? '只读' : r;

export default function CollaboratorsPanel({
  ledgerId,
  ledgerKind,
  myRole,
  myUserId,
  initialMembers,
  initialInvites,
}: {
  ledgerId: string;
  ledgerKind: string;
  myRole: 'owner' | 'editor' | 'viewer';
  myUserId: string;
  initialMembers: Member[];
  initialInvites: Invite[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('editor');
  const [error, setError] = useState('');

  // Phase 2 之后所有 kind 都能共享
  const shareBlocked = false;
  void ledgerKind;

  async function reload() {
    startTransition(() => router.refresh());
  }

  async function generateInvite() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '生成失败');
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    const ok = await confirm({
      title: '撤回这份邀请？',
      body: '被邀请者用旧链接将无法加入',
      danger: true,
      confirmText: '撤回',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetch(`/api/ledgers/${ledgerId}/invites/${inviteId}`, { method: 'DELETE' });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(targetUserId: string, role: 'editor' | 'viewer') {
    setBusy(true);
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}/collaborators/${targetUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '修改失败');
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(targetUserId: string, isSelf: boolean) {
    const ok = await confirm({
      title: isSelf ? '退出这个账本？' : '移除该成员？',
      body: isSelf
        ? '退出后你将无法再看到这个账本，除非重新被邀请'
        : '对方将立即失去访问权限',
      danger: true,
      confirmText: isSelf ? '退出' : '移除',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}/collaborators/${targetUserId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '操作失败');
        return;
      }
      if (isSelf) {
        router.push('/ledgers');
      } else {
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      // 简单反馈，不引入 toast provider 依赖检查
      alert('已复制邀请链接');
    } catch {
      // clipboard 拒绝时降级：把链接直接放进 prompt 让用户手动复制
      window.prompt('复制以下链接分享给对方：', url);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {shareBlocked && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          工作/桃源账本的共享功能正在开发中。当前版本仅普通账本、旅游账本支持多人协作。
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">成员</h2>
        <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white dark:divide-ink-800 dark:border-ink-800 dark:bg-ink-950">
          {initialMembers.map((m) => {
            const isSelf = m.userId === myUserId;
            const canManage = myRole === 'owner' && !isSelf && m.role !== 'owner';
            const canRemoveSelf = isSelf && m.role !== 'owner';
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex-1 truncate font-medium">
                  {m.username}
                  {isSelf && <span className="ml-2 text-xs text-ink-500">（你）</span>}
                </span>
                <span className="text-sm text-ink-500">{roleLabel(m.role)}</span>
                {canManage && (
                  <>
                    <select
                      value={m.role === 'editor' || m.role === 'viewer' ? m.role : 'editor'}
                      onChange={(e) =>
                        changeRole(m.userId, e.target.value as 'editor' | 'viewer')
                      }
                      disabled={busy}
                      className="rounded border border-ink-200 bg-white px-2 py-1 text-sm dark:border-ink-700 dark:bg-ink-900"
                    >
                      <option value="editor">编辑者</option>
                      <option value="viewer">只读</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeMember(m.userId, false)}
                      disabled={busy}
                      className="text-sm text-rose-600 hover:underline disabled:opacity-50"
                    >
                      移除
                    </button>
                  </>
                )}
                {canRemoveSelf && (
                  <button
                    type="button"
                    onClick={() => removeMember(m.userId, true)}
                    disabled={busy}
                    className="text-sm text-rose-600 hover:underline disabled:opacity-50"
                  >
                    退出账本
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {myRole === 'owner' && !shareBlocked && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">邀请</h2>
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-ink-100 bg-white p-4 dark:border-ink-800 dark:bg-ink-950">
            <label className="text-sm text-ink-600 dark:text-ink-300">邀请为：</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'editor' | 'viewer')}
              disabled={busy}
              className="rounded border border-ink-200 bg-white px-2 py-1 text-sm dark:border-ink-700 dark:bg-ink-900"
            >
              <option value="editor">编辑者（可增删改条目）</option>
              <option value="viewer">只读</option>
            </select>
            <button
              type="button"
              onClick={generateInvite}
              disabled={busy}
              className="rounded bg-indigo-600 px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              生成邀请链接
            </button>
            <p className="w-full text-xs text-ink-500">
              邀请链接 7 天内有效，只能使用一次。将链接发给对方，对方登录后点击即可加入。
            </p>
          </div>

          {initialInvites.length > 0 && (
            <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white dark:divide-ink-800 dark:border-ink-800 dark:bg-ink-950">
              {initialInvites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="flex-1 truncate text-sm">
                    <span className="text-ink-500">邀请为 {roleLabel(inv.role)} ·</span>{' '}
                    <span className="text-ink-400">
                      {inv.expiresAt
                        ? `${new Date(inv.expiresAt).toLocaleDateString()} 过期`
                        : '永久'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => copyInvite(inv.token)}
                    disabled={busy}
                    className="text-sm text-indigo-600 hover:underline disabled:opacity-50"
                  >
                    复制链接
                  </button>
                  <button
                    type="button"
                    onClick={() => revokeInvite(inv.id)}
                    disabled={busy}
                    className="text-sm text-rose-600 hover:underline disabled:opacity-50"
                  >
                    撤回
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
