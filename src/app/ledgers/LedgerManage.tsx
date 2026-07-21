'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import PresetPicker from './new/PresetPicker';

type Active = {
  id: string;
  kind: string;
  name: string;
  icon: string | null;
};

type Trashed = Active & { deletedAt: string };

const RETENTION_DAYS = 60;

function daysLeft(deletedAtIso: string): number {
  const deleted = new Date(deletedAtIso).getTime();
  const cutoff = deleted + RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((cutoff - Date.now()) / (24 * 60 * 60 * 1000)));
}

function iconFor(kind: string, icon: string | null): string {
  if (icon) return icon;
  switch (kind) {
    case 'work':
      return '💼';
    case 'taoyuan':
      return '🌸';
    case 'travel':
      return '✈️';
    default:
      return '📒';
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'work':
      return '工作账本';
    case 'taoyuan':
      return '桃源账本';
    case 'general':
      return '普通账本';
    case 'travel':
      return '旅游账本';
    default:
      return kind;
  }
}

export default function LedgerManage({
  active,
  trashed,
  hasWork,
  hasTaoyuan,
}: {
  active: Active[];
  trashed: Trashed[];
  hasWork: boolean;
  hasTaoyuan: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function del(l: Active) {
    const isBuiltin = l.kind === 'work' || l.kind === 'taoyuan';
    const msg = isBuiltin
      ? `把 "${l.name}" 放入回收站？\n\n首页不再显示。60 天内可恢复；恢复后原有数据完整保留（该账本的实际条目并未被删除）。`
      : `把 "${l.name}" 放入回收站？\n\n首页不再显示。60 天内可恢复；60 天后系统自动清除，届时该账本的所有记录都会一并销毁！`;
    if (!confirm(msg)) return;

    const res = await fetch(`/api/ledgers/${l.id}`, { method: 'DELETE' });
    if (res.ok) {
      startTransition(() => router.refresh());
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '删除失败');
    }
  }

  async function restore(t: Trashed) {
    if (!confirm(`把 "${t.name}" 从回收站恢复？`)) return;
    const res = await fetch(`/api/ledgers/${t.id}/restore`, { method: 'POST' });
    if (res.ok) {
      startTransition(() => router.refresh());
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '恢复失败');
    }
  }

  async function purge(t: Trashed) {
    const isBuiltin = t.kind === 'work' || t.kind === 'taoyuan';
    const warning = isBuiltin
      ? `永久删除 "${t.name}" 的账本入口？\n\n注意：这只会删掉入口元数据，该账本的实际条目数据保留；以后可以从预设库重新添加，届时数据仍在。`
      : `永久删除 "${t.name}"？\n\n⚠️ 该账本所有记录会立即一并销毁，此操作不可恢复！`;
    if (!confirm(warning)) return;

    const res = await fetch(`/api/ledgers/${t.id}?permanent=1`, {
      method: 'DELETE',
    });
    if (res.ok) {
      startTransition(() => router.refresh());
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '删除失败');
    }
  }

  return (
    <div className="space-y-8">
      {/* 我的账本 */}
      <section>
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2 className="text-sm font-medium text-ink-700 dark:text-ink-200">
            我的账本
          </h2>
          <span className="text-xs text-ink-400">{active.length} 个</span>
        </div>
        {active.length === 0 ? (
          <div className="text-center text-sm text-ink-400 py-6 rounded-2xl bg-ink-50 dark:bg-ink-800">
            还没有账本，从下方添加一个
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700"
              >
                <span className="text-xl">{iconFor(l.kind, l.icon)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-medium truncate">{l.name}</div>
                  <div className="text-xs text-ink-500 mt-0.5">{kindLabel(l.kind)}</div>
                </div>
                <button
                  onClick={() => del(l)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 添加账本 */}
      <section>
        <h2 className="text-sm font-medium text-ink-700 dark:text-ink-200 mb-3 px-1">
          添加账本
        </h2>
        <PresetPicker hasWork={hasWork} hasTaoyuan={hasTaoyuan} />
      </section>

      {/* 回收站 */}
      <section>
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2 className="text-sm font-medium text-ink-700 dark:text-ink-200">
            回收站
          </h2>
          <span className="text-xs text-ink-400">
            {trashed.length > 0 ? `${trashed.length} 个 · 60 天后自动清空` : '空'}
          </span>
        </div>
        {trashed.length === 0 ? (
          <div className="text-center text-xs text-ink-400 py-4 rounded-2xl bg-ink-50 dark:bg-ink-800">
            没有已删除的账本
          </div>
        ) : (
          <div className="space-y-2">
            {trashed.map((t) => {
              const days = daysLeft(t.deletedAt);
              return (
                <div
                  key={t.id}
                  className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 opacity-90"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl grayscale">{iconFor(t.kind, t.icon)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-medium truncate line-through text-ink-500">
                        {t.name}
                      </div>
                      <div className="text-xs text-ink-500 mt-0.5">
                        {kindLabel(t.kind)} ·{' '}
                        {days > 0 ? (
                          <>还有 {days} 天自动清除</>
                        ) : (
                          <span className="text-red-500">即将清除</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => restore(t)}
                      className="flex-1 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm"
                    >
                      恢复
                    </button>
                    <button
                      onClick={() => purge(t)}
                      className="flex-1 py-2 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm"
                    >
                      永久删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
