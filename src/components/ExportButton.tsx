'use client';

import { useState } from 'react';

type Format = 'csv' | 'json';

const ENDPOINT: Record<Format, string> = {
  csv: '/api/export',
  json: '/api/export/json',
};

export default function ExportButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<string>('');
  const [open, setOpen] = useState(false);

  async function download(format: Format) {
    setError('');
    setSummary('');
    setBusy(format);
    try {
      const res = await fetch(ENDPOINT[format], { cache: 'no-store' });
      if (!res.ok) throw new Error('导出失败');

      const ext = format === 'csv' ? 'csv' : 'json';
      let filename = `account-book-${new Date().toISOString().slice(0, 10)}.${ext}`;
      const cd = res.headers.get('content-disposition');
      const m = cd?.match(/filename="?([^";]+)"?/i);
      if (m?.[1]) {
        try {
          filename = decodeURIComponent(m[1]);
        } catch {
          filename = m[1];
        }
      }

      // JSON 备份带条数摘要，导出后给用户一个"确实备到了"的确认
      const raw = res.headers.get('x-backup-summary');
      if (raw) {
        try {
          const counts = JSON.parse(decodeURIComponent(raw)) as Record<string, number>;
          const parts = Object.entries(counts)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${k} ${v}`);
          if (parts.length > 0) setSummary(`已备份：${parts.join(' · ')}`);
        } catch {
          /* 摘要只是锦上添花，解析失败不影响下载 */
        }
      }

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
      setBusy(null);
    }
  }

  return (
    <div className={className}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
      >
        <div className="text-left">
          <div className="text-lg font-medium">导出备份</div>
          <div className="text-xs text-ink-500 mt-1">
            全部账本 · CSV 查看 / JSON 完整还原
          </div>
        </div>
        <span className={`text-ink-400 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <button
            onClick={() => download('json')}
            disabled={busy !== null}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 active:scale-[0.98] transition disabled:opacity-60"
          >
            <div className="text-left">
              <div className="text-sm font-medium">完整备份 JSON</div>
              <div className="text-[11px] opacity-70 mt-0.5">
                {busy === 'json' ? '正在准备…' : '可一键导入还原，换服务器用这个'}
              </div>
            </div>
            <span>↓</span>
          </button>

          <button
            onClick={() => download('csv')}
            disabled={busy !== null}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition disabled:opacity-60"
          >
            <div className="text-left">
              <div className="text-sm font-medium">表格 CSV</div>
              <div className="text-[11px] text-ink-500 mt-0.5">
                {busy === 'csv' ? '正在准备…' : 'Excel 直接打开，仅供查看'}
              </div>
            </div>
            <span className="text-ink-400">↓</span>
          </button>
        </div>
      )}

      {summary && <p className="text-emerald-600 dark:text-emerald-400 text-xs mt-2 px-2">{summary}</p>}
      {error && <p className="text-red-500 text-xs mt-2 px-2">{error}</p>}
    </div>
  );
}
