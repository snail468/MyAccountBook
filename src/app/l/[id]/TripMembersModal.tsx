'use client';

import { useState } from 'react';
import type { Member } from './TravelView';
import { useAlert, useConfirm } from '@/components/ui/Dialog';
import { friendlyFetchError } from '@/lib/netError';

export default function TripMembersModal({
  ledgerId,
  members,
  onClose,
  onChanged,
}: {
  ledgerId: string;
  members: Member[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'name' | 'user'>('name');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const alert = useAlert();

  async function add() {
    setError('');
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      const body =
        mode === 'user' ? { username: v } : { displayName: v };
      const res = await fetch(`/api/ledgers/${ledgerId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '添加失败');
      setValue('');
      onChanged();
    } catch (e) {
      setError(friendlyFetchError(e) ?? (e instanceof Error ? e.message : '添加失败'));
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string, name: string) {
    const ok = await confirm({
      title: `删除成员 "${name}"？`,
      body: '若该成员有已记录的开销/分摊将拦截删除。',
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    const res = await fetch(`/api/ledgers/${ledgerId}/members/${id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      onChanged();
    } else {
      const data = await res.json().catch(() => ({}));
      await alert({ title: '删除失败', body: data.error || '未知错误', danger: true });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium mb-4">成员</h3>

        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setMode('name')}
            className={`flex-1 py-2 rounded-2xl text-sm ${
              mode === 'name'
                ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'bg-ink-50 dark:bg-ink-800'
            }`}
          >
            添名字
          </button>
          <button
            onClick={() => setMode('user')}
            className={`flex-1 py-2 rounded-2xl text-sm ${
              mode === 'user'
                ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'bg-ink-50 dark:bg-ink-800'
            }`}
          >
            邀请注册用户
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={mode === 'name' ? '朋友的名字' : '用户名'}
            maxLength={32}
            className="flex-1 px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <button
            onClick={add}
            disabled={busy || !value.trim()}
            className="px-4 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm disabled:opacity-50"
          >
            加
          </button>
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        <div className="mt-4 space-y-2">
          {members.length === 0 && (
            <div className="text-center text-sm text-ink-400 py-6">还没有成员</div>
          )}
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between p-3 rounded-2xl bg-ink-50 dark:bg-ink-800"
            >
              <div>
                <div className="text-sm font-medium">{m.displayName}</div>
                <div className="text-[11px] text-ink-500">
                  {m.userId ? '注册用户' : '纯名字'}
                </div>
              </div>
              <button
                onClick={() => del(m.id, m.displayName)}
                className="text-ink-400 hover:text-red-500 text-xs px-2"
                aria-label="删除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-3 rounded-2xl bg-ink-50 dark:bg-ink-800"
        >
          完成
        </button>
      </div>
    </div>
  );
}
