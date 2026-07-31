'use client';

import Money from '@/components/ui/Money';
import { formatShort } from '@/lib/datetime';
import { iconOf } from '@/lib/generalCategories';
import type { Entry } from './types';

export default function EntryRow({
  entry,
  customCategoriesJson,
  onEdit,
  onDelete,
  onZoomImage,
}: {
  entry: Entry;
  customCategoriesJson: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onZoomImage: (url: string) => void;
}) {
  const isIncome = entry.direction === 'income';
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
      <div className="w-9 h-9 rounded-xl bg-ink-50 dark:bg-ink-700 flex items-center justify-center text-lg shrink-0">
        {iconOf(entry.category, customCategoriesJson)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{entry.category}</div>
        <div className="text-[11px] text-ink-500 truncate">
          {formatShort(entry.occurredAt).slice(11)}
          {entry.tags && <> · {entry.tags}</>}
          {entry.note && <> · {entry.note}</>}
        </div>
        {entry.imageUrls.length > 0 && (
          <div className="mt-1 flex gap-1">
            {entry.imageUrls.map((url, i) => (
              <button
                key={i}
                onClick={() => onZoomImage(url)}
                className="w-8 h-8 rounded overflow-hidden bg-ink-100 dark:bg-ink-700"
                aria-label={`查看图 ${i + 1}`}
              >
                { }
                <img src={url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        className={`num text-sm font-medium ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}
      >
        {isIncome ? '+' : '-'}
        <Money cents={entry.amountCents} />
      </div>
      <button
        onClick={onEdit}
        className="text-ink-400 hover:text-ink-700 dark:hover:text-ink-100 text-xs px-1"
        aria-label="编辑"
        title="编辑"
      >
        ✎
      </button>
      <button
        onClick={onDelete}
        className="text-ink-300 hover:text-red-500 text-xs px-1"
        aria-label="删除"
      >
        ✕
      </button>
    </div>
  );
}
