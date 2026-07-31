'use client';

// 完整备份 JSON 的还原入口。与 ExportButton 成对出现。
//
// 交互刻意做成两步，不给"点一下就覆盖"的机会：
//   1. 选文件 → 自动走 dryRun，把"要导入多少条、有什么会被跳过"摆出来
//   2. 用户看过预览，再选合并还是覆盖；覆盖额外过一次危险确认
//
// 覆盖是不可逆的（会先清空当前账号的全部业务数据），所以确认文案里
// 直接写清楚"当前有多少条会被删掉"。

import { useRef, useState } from 'react';
import { useAlert, useConfirm } from '@/components/ui/Dialog';

type Preview = {
  summary: Record<string, number>;
  skipped: string[];
  imageRefCount: number;
  exportedAt: string;
  sourceUsername: string;
};

const countLine = (summary: Record<string, number>) =>
  Object.entries(summary)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ') || '（空备份）';

export default function ImportButton({ className }: { className?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const alert = useAlert();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  function reset() {
    setBackup(null);
    setPreview(null);
    setError('');
    setDone('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function pickFile(file: File) {
    reset();
    setBusy(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('这个文件不是合法的 JSON');
      }

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'merge', dryRun: true, backup: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '备份文件校验失败');

      setBackup(parsed);
      setPreview({
        summary: data.summary,
        skipped: data.skipped ?? [],
        imageRefCount: data.imageRefCount ?? 0,
        exportedAt: data.exportedAt,
        sourceUsername: data.sourceUsername,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取失败');
    } finally {
      setBusy(false);
    }
  }

  async function run(mode: 'merge' | 'replace') {
    if (!backup) return;

    if (mode === 'replace') {
      const ok = await confirm({
        title: '用备份覆盖当前数据？',
        body: (
          <>
            <p>
              当前账号下的<strong>全部账本、记账、活动和旅游数据都会被删除</strong>，
              然后替换成备份里的内容。
            </p>
            <p className="mt-2">这一步不可撤销。建议先导出一份当前数据留底。</p>
          </>
        ),
        confirmText: '确认覆盖',
        danger: true,
      });
      if (!ok) return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, dryRun: false, backup }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '导入失败');

      setDone(`已导入：${countLine(data.summary)}`);
      setBackup(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';

      await alert({
        title: mode === 'replace' ? '已还原' : '已合并导入',
        body: (
          <>
            <p>{countLine(data.summary)}</p>
            {data.imageRefCount > 0 && (
              <p className="mt-2 text-sm">
                其中 {data.imageRefCount} 条记录带图片引用。
                <strong>JSON 备份不含图片文件本身</strong> —— 如果这是换服务器，
                记得把 data/uploads 目录也一起搬过来。
              </p>
            )}
            {Array.isArray(data.skipped) && data.skipped.length > 0 && (
              <ul className="mt-2 text-sm list-disc pl-5">
                {data.skipped.map((s: string) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </>
        ),
      });
      // 导入的数据要重新渲染才看得到
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
      >
        <div className="text-left">
          <div className="text-lg font-medium">导入还原</div>
          <div className="text-xs text-ink-500 mt-1">从完整备份 JSON 恢复数据</div>
        </div>
        <span className={`text-ink-400 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickFile(f);
            }}
          />

          {!preview && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition disabled:opacity-60"
            >
              <div className="text-left">
                <div className="text-sm font-medium">选择备份文件</div>
                <div className="text-[11px] text-ink-500 mt-0.5">
                  {busy ? '正在校验…' : '选中后先给你看一遍预览，不会立刻写入'}
                </div>
              </div>
              <span className="text-ink-400">↑</span>
            </button>
          )}

          {preview && (
            <div className="p-4 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 space-y-3">
              <div>
                <div className="text-sm font-medium">备份预览</div>
                <div className="text-[11px] text-ink-500 mt-1">
                  来自 {preview.sourceUsername} · {preview.exportedAt.slice(0, 10)}
                </div>
                <div className="text-xs mt-2">{countLine(preview.summary)}</div>
                {preview.imageRefCount > 0 && (
                  <div className="text-[11px] text-ink-500 mt-1">
                    {preview.imageRefCount} 条带图片引用（图片文件不在 JSON 里）
                  </div>
                )}
                {preview.skipped.length > 0 && (
                  <ul className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 list-disc pl-4">
                    {preview.skipped.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => void run('merge')}
                  disabled={busy}
                  className="p-3 rounded-xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm font-medium active:scale-[0.98] transition disabled:opacity-60"
                >
                  合并导入
                </button>
                <button
                  onClick={() => void run('replace')}
                  disabled={busy}
                  className="p-3 rounded-xl bg-red-600 text-white text-sm font-medium active:scale-[0.98] transition disabled:opacity-60"
                >
                  覆盖还原
                </button>
              </div>
              <div className="text-[11px] text-ink-500">
                合并 = 保留现有数据并追加；覆盖 = 先清空当前账号再还原（不可撤销）
              </div>
              <button
                onClick={reset}
                disabled={busy}
                className="w-full text-[11px] text-ink-500 underline disabled:opacity-60"
              >
                换个文件
              </button>
            </div>
          )}
        </div>
      )}

      {done && (
        <p className="text-emerald-600 dark:text-emerald-400 text-xs mt-2 px-2">{done}</p>
      )}
      {error && <p className="text-red-500 text-xs mt-2 px-2">{error}</p>}
    </div>
  );
}
