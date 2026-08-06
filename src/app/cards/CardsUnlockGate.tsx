'use client';

// 银行卡页面级验密门。
//
// 未解锁前用户在 /cards 上只看到这个组件；输入登录密码 → POST /api/cards/unlock
// → 服务端写 session.cardsUnlockedAt → router.refresh() → 页面切到 CardsClient。
// 10 分钟 TTL 由 session 层控制，前端不用关心倒计时——过期时 reveal 接口
// 会返回 401，CardsClient 自行 refresh 回到本组件。

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const inputCls =
  'w-full px-3 py-2 rounded-xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400';

export default function CardsUnlockGate() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/cards/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setDisabled(data.error || '银行卡备份功能未启用');
        return;
      }
      if (!res.ok) throw new Error(data.error || '验证失败');
      setPassword('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败');
    } finally {
      setBusy(false);
    }
  }

  if (disabled) {
    return (
      <div className="px-4 py-10">
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <div className="font-medium text-sm mb-1">功能未启用</div>
          <p className="text-xs text-ink-500">{disabled}</p>
          <p className="text-xs text-ink-500 mt-2">
            生成密钥：<code className="text-[11px]">openssl rand -base64 32</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-24">
      <div className="p-4 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 mb-4">
        <p className="text-[11px] text-ink-500 leading-relaxed">
          进入前请输入登录密码。解锁后 10 分钟内查看卡号无需再次验密；超时自动上锁。
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="登录密码"
          className={inputCls}
          autoComplete="current-password"
          autoFocus
          required
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="w-full py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-60"
        >
          {busy ? '验证中…' : '解锁'}
        </button>
      </form>
    </div>
  );
}
