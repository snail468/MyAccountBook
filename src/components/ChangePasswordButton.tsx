'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAlert } from '@/components/ui/Dialog';

const inputCls =
  'w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400';

export default function ChangePasswordButton({ className }: { className?: string }) {
  const router = useRouter();
  const alert = useAlert();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setCurrent('');
    setNext('');
    setConfirmPw('');
    setError('');
  }

  async function submit() {
    setError('');
    if (next !== confirmPw) {
      setError('两次输入的新密码不一致');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '修改失败');
      setOpen(false);
      reset();
      await alert({
        title: '密码已修改',
        body: '其它设备上的登录已全部失效，需要重新登录。当前设备不受影响。',
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '修改失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
      >
        <div className="text-left">
          <div className="text-lg font-medium">修改密码</div>
          <div className="text-xs text-ink-500 mt-1">改完会让其它设备重新登录</div>
        </div>
        <span className="text-ink-400">›</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-md"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium mb-4">修改密码</h3>

            <label className="block text-xs text-ink-500 mb-1">当前密码</label>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={inputCls}
            />

            <label className="block text-xs text-ink-500 mt-3 mb-1">
              新密码（至少 8 位，别用连续数字或常见弱口令）
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={inputCls}
            />

            <label className="block text-xs text-ink-500 mt-3 mb-1">再输一次新密码</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className={inputCls}
            />

            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800"
              >
                取消
              </button>
              <button
                onClick={submit}
                disabled={busy || !current || !next}
                className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
              >
                {busy ? '提交中…' : '确认修改'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
