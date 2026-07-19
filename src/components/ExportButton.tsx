'use client';

import { useState } from 'react';

export default function ExportButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/export', { cache: 'no-store' });
      if (!res.ok) throw new Error('导出失败');
      // 从 Content-Disposition 里提取文件名，失败则回落到默认命名
      let filename = `account-book-${new Date().toISOString().slice(0, 10)}.csv`;
      const cd = res.headers.get('content-disposition');
      const m = cd?.match(/filename="?([^";]+)"?/i);
      if (m?.[1]) filename = m[1];
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // iOS Safari 有时需要延迟释放，否则下载会失败
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        onClick={download}
        disabled={busy}
        className="w-full flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition disabled:opacity-60"
      >
        <div className="text-left">
          <div className="text-lg font-medium">导出备份</div>
          <div className="text-xs text-ink-500 mt-1">
            {busy ? '正在准备…' : '下载 CSV，含全部数据'}
          </div>
        </div>
        <span className="text-ink-400">↓</span>
      </button>
      {error && <p className="text-red-500 text-xs mt-2 px-2">{error}</p>}
    </div>
  );
}
