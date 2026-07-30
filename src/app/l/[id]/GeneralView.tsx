'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Money from '@/components/ui/Money';
import Lightbox from '@/components/ui/Lightbox';
import { useAlert, useConfirm, useToast } from '@/components/ui/Dialog';
import { formatShort, localInputToISO, toLocalInput } from '@/lib/datetime';
import { yuanToCents } from '@/lib/money';
import {
  effectiveCategories,
  iconOf,
  ICON_LIBRARY,
  parseCustom,
  type CustomCategoriesJson,
  type GeneralCategory,
  type GeneralCategoryDirection,
} from '@/lib/generalCategories';
import ImageUploader from '@/app/taoyuan/ImageUploader';

type Entry = {
  id: string;
  direction: string;
  category: string;
  amountCents: number;
  tags: string | null;
  note: string | null;
  imageUrls: string[];
  occurredAt: string;
};

type LedgerMeta = {
  id: string;
  name: string;
  icon: string | null;
  budgetCents: number | null;
  customCategories: string | null;
};

export type GeneralSummary = {
  monthStartISO: string;
  monthEndISO: string;
  income: number;
  expense: number;
  topCats: { category: string; cents: number }[];
};

export default function GeneralView({
  ledger,
  summary,
  initialEntries,
  initialCursor,
}: {
  ledger: LedgerMeta;
  /** 本月汇总由服务端用 SQL 聚合算好 —— 分页后客户端手里没有全量数据，算不出来 */
  summary: GeneralSummary;
  initialEntries: Entry[];
  initialCursor: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showRecord, setShowRecord] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const confirm = useConfirm();

  // —— 分页 ——
  const [extraEntries, setExtraEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');

  // router.refresh() 后服务端会重新给第一页 —— 把已加载的后续页丢掉，
  // 否则新增/删除的条目会和旧的分页数据打架（重复或缺失）。
  const firstPageSig = initialEntries.map((e) => e.id).join(',');
  useEffect(() => {
    setExtraEntries([]);
    setCursor(initialCursor);
    setLoadError('');
  }, [firstPageSig, initialCursor]);

  // 挂着过夜时自动翻篇：到次日零点触发一次 refresh，让"本月"边界跟上
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ms = tomorrow.getTime() - now.getTime();
    const timer = setTimeout(() => router.refresh(), ms + 1000);
    return () => clearTimeout(timer);
  }, [router]);

  const entries = useMemo(
    () => [...initialEntries, ...extraEntries],
    [initialEntries, extraEntries],
  );

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError('');
    try {
      const res = await fetch(
        `/api/ledgers/${ledger.id}/entries?cursor=${encodeURIComponent(cursor)}`,
        { cache: 'no-store' },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '加载失败');
      setExtraEntries((prev) => [...prev, ...(j.entries as Entry[])]);
      setCursor(j.nextCursor ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoadingMore(false);
    }
  }

  const monthStart = useMemo(() => new Date(summary.monthStartISO), [summary.monthStartISO]);
  const income = summary.income;
  const expense = summary.expense;
  const net = income - expense;
  const topCats: [string, number][] = summary.topCats.map((c) => [c.category, c.cents]);

  // 按天分组（只对已加载的条目分组）
  const grouped = new Map<string, Entry[]>();
  for (const e of entries) {
    const d = new Date(e.occurredAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const arr = grouped.get(key) ?? [];
    arr.push(e);
    grouped.set(key, arr);
  }
  const dayKeys = [...grouped.keys()].sort().reverse();

  const budgetPct = ledger.budgetCents && ledger.budgetCents > 0
    ? Math.min(100, Math.round((expense / ledger.budgetCents) * 100))
    : null;
  const budgetColor =
    budgetPct === null
      ? ''
      : expense > (ledger.budgetCents ?? 0)
        ? 'bg-red-500'
        : budgetPct >= 80
          ? 'bg-yellow-500'
          : 'bg-emerald-500';

  async function del(entry: Entry) {
    const ok = await confirm({
      title: `删除 "${entry.category}"？`,
      body: `${(entry.amountCents / 100).toFixed(2)} 元`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    const res = await fetch(`/api/ledgers/${ledger.id}/entries/${entry.id}`, {
      method: 'DELETE',
    });
    if (res.ok) startTransition(() => router.refresh());
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1 flex items-center gap-2 truncate">
          <span>{ledger.icon ?? '📒'}</span>
          <span className="truncate">{ledger.name}</span>
        </h1>
        <button
          onClick={() => setShowSettings(true)}
          className="text-ink-400 text-sm"
          aria-label="设置"
        >
          ⚙
        </button>
      </div>

      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5">
        <div className="text-xs text-ink-500 mb-1">
          本月 {monthStart.getMonth() + 1} 月 · 结余 (元)
        </div>
        <div
          className={`num text-4xl font-bold ${net < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}
        >
          <Money cents={net} sign />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-ink-50 dark:bg-ink-700">
            <div className="text-ink-500">收入</div>
            <div className="num font-medium mt-0.5 text-emerald-600 dark:text-emerald-400">
              <Money cents={income} />
            </div>
          </div>
          <div className="p-2 rounded-lg bg-ink-50 dark:bg-ink-700">
            <div className="text-ink-500">支出</div>
            <div className="num font-medium mt-0.5 text-red-500">
              <Money cents={expense} />
            </div>
          </div>
        </div>

        {ledger.budgetCents && ledger.budgetCents > 0 && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-xs mb-1">
              <span className="text-ink-500">月度预算</span>
              <span className="num text-ink-700 dark:text-ink-300">
                <Money cents={expense} /> / <Money cents={ledger.budgetCents} />
              </span>
            </div>
            <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
              <div
                className={`h-full ${budgetColor} transition-[width]`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            {expense > ledger.budgetCents && (
              <div className="text-[11px] text-red-500 mt-1">
                超支 <Money cents={expense - ledger.budgetCents} />
              </div>
            )}
          </div>
        )}
      </div>

      {topCats.length > 0 && (
        <div className="mt-4 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5">
          <div className="text-xs text-ink-500 mb-3">本月类别 · 支出排行</div>
          <div className="space-y-2">
            {topCats.map(([cat, cents]) => {
              const pct = expense > 0 ? Math.round((cents / expense) * 100) : 0;
              return (
                <div key={cat}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="flex items-center gap-1.5">
                      <span>{iconOf(cat, ledger.customCategories)}</span>
                      <span>{cat}</span>
                    </span>
                    <span className="num text-ink-700 dark:text-ink-300">
                      <Money cents={cents} /> <span className="text-[10px] text-ink-500">{pct}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 mt-1 overflow-hidden">
                    <div
                      className="h-full bg-ink-500 dark:bg-ink-300 transition-[width]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={() => setShowRecord(true)}
        className="mt-4 w-full py-4 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-base font-medium active:scale-[0.98]"
      >
        + 记一笔
      </button>

      <div className="mt-6 space-y-4">
        {dayKeys.length === 0 && (
          <div className="text-center text-sm text-ink-400 py-10">
            还没有记录，点击上方 + 开始
          </div>
        )}
        {dayKeys.map((day) => {
          const list = grouped.get(day) ?? [];
          const dayIncome = list
            .filter((e) => e.direction === 'income')
            .reduce((a, e) => a + e.amountCents, 0);
          const dayExpense = list
            .filter((e) => e.direction === 'expense')
            .reduce((a, e) => a + e.amountCents, 0);
          return (
            <section key={day}>
              <div className="flex items-baseline justify-between px-1 mb-2 text-xs text-ink-500">
                <span>{day}</span>
                <span className="num">
                  {dayIncome > 0 && <>入 <Money cents={dayIncome} /> </>}
                  出 <Money cents={dayExpense} />
                </span>
              </div>
              <div className="space-y-2">
                {list.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    customCategoriesJson={ledger.customCategories}
                    onEdit={() => setEditing(e)}
                    onDelete={() => del(e)}
                    onZoomImage={setZoomImg}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {cursor && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm text-ink-500 active:scale-[0.98] transition disabled:opacity-60"
          >
            {loadingMore ? '加载中…' : '加载更早的记录'}
          </button>
        )}
        {!cursor && entries.length > 0 && (
          <div className="text-center text-[11px] text-ink-400 py-2">已经到底了</div>
        )}
        {loadError && (
          <p className="text-red-500 text-xs text-center">{loadError}</p>
        )}
      </div>

      {showRecord && (
        <RecordModal
          ledgerId={ledger.id}
          ledgerName={ledger.name}
          customCategoriesJson={ledger.customCategories}
          onManageCategories={() => {
            setShowRecord(false);
            setShowCategoryManager(true);
          }}
          onClose={() => setShowRecord(false)}
          onSaved={() => {
            setShowRecord(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {editing && (
        <EditEntryModal
          ledgerId={ledger.id}
          customCategoriesJson={ledger.customCategories}
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          ledger={ledger}
          onManageCategories={() => {
            setShowSettings(false);
            setShowCategoryManager(true);
          }}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setShowSettings(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {showCategoryManager && (
        <CategoryManagerModal
          ledgerId={ledger.id}
          customCategoriesJson={ledger.customCategories}
          onClose={() => setShowCategoryManager(false)}
          onSaved={() => {
            setShowCategoryManager(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {zoomImg && <Lightbox src={zoomImg} onClose={() => setZoomImg(null)} />}
    </>
  );
}

function EntryRow({
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
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

// ==================== 记账 / 编辑 通用表单 ====================

function EntryForm({
  ledgerName,
  customCategoriesJson,
  initial,
  saving,
  error,
  onSubmit,
  onCancel,
  onManageCategories,
  submitText,
}: {
  ledgerName: string;
  customCategoriesJson: string | null;
  initial?: Partial<Entry>;
  saving: boolean;
  error: string;
  onSubmit: (data: {
    direction: 'income' | 'expense';
    category: string;
    amountCents: number;
    tags: string | null;
    note: string | null;
    imageUrls: string[];
    occurredAt: string | null;
  }) => void;
  onCancel: () => void;
  onManageCategories?: () => void;
  submitText: string;
}) {
  const initialDir = (initial?.direction as 'income' | 'expense') ?? 'expense';
  const [direction, setDirection] = useState<'expense' | 'income'>(initialDir);
  const expenseCats = effectiveCategories(customCategoriesJson, 'expense');
  const incomeCats = effectiveCategories(customCategoriesJson, 'income');
  const options = direction === 'expense' ? expenseCats : incomeCats;
  const initialCategory =
    initial?.category ??
    (direction === 'expense'
      ? expenseCats[0]?.name ?? '其它支出'
      : incomeCats[0]?.name ?? '其它收入');
  const [category, setCategory] = useState<string>(initialCategory);
  const [amount, setAmount] = useState(
    initial?.amountCents ? (initial.amountCents / 100).toFixed(2) : '',
  );
  const [tags, setTags] = useState(initial?.tags ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [imageUrls, setImageUrls] = useState<string[]>(initial?.imageUrls ?? []);
  const [occurredAt, setOccurredAt] = useState(
    toLocalInput(initial?.occurredAt ? new Date(initial.occurredAt) : new Date()),
  );

  function submit() {
    const cents = yuanToCents(amount);
    if (cents === null || cents === 0) return;
    if (!category) return;
    onSubmit({
      direction,
      category,
      amountCents: cents,
      tags: tags.trim() || null,
      note: note.trim() || null,
      imageUrls,
      occurredAt: localInputToISO(occurredAt),
    });
  }

  return (
    <>
      <h3 className="text-lg font-medium mb-4">{ledgerName} · {submitText}</h3>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => {
            setDirection('expense');
            setCategory(expenseCats[0]?.name ?? '其它支出');
          }}
          className={`flex-1 py-2.5 rounded-2xl text-sm ${
            direction === 'expense'
              ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
              : 'bg-ink-50 dark:bg-ink-800'
          }`}
        >
          支出
        </button>
        <button
          onClick={() => {
            setDirection('income');
            setCategory(incomeCats[0]?.name ?? '其它收入');
          }}
          className={`flex-1 py-2.5 rounded-2xl text-sm ${
            direction === 'income'
              ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
              : 'bg-ink-50 dark:bg-ink-800'
          }`}
        >
          收入
        </button>
      </div>

      <div className="flex items-baseline justify-between mb-1">
        <label className="text-xs text-ink-500">类别</label>
        {onManageCategories && (
          <button
            onClick={onManageCategories}
            className="text-[11px] text-ink-500 underline"
          >
            管理类别
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {options.map((c) => (
          <button
            key={c.name}
            onClick={() => setCategory(c.name)}
            className={`p-2 rounded-2xl text-center transition ${
              category === c.name
                ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'bg-ink-50 dark:bg-ink-800'
            }`}
          >
            <div className="text-lg leading-none">{c.icon}</div>
            <div className="text-[10px] mt-1 truncate">{c.name}</div>
          </button>
        ))}
      </div>

      <label className="block text-xs text-ink-500 mt-4 mb-1">金额（元）</label>
      <input
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full px-4 py-4 text-2xl num rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
      />

      <label className="block text-xs text-ink-500 mt-3 mb-1">标签（逗号分隔）</label>
      <input
        value={tags ?? ''}
        onChange={(e) => setTags(e.target.value)}
        maxLength={200}
        placeholder="午饭, 同事"
        className={inputCls}
      />

      <label className="block text-xs text-ink-500 mt-3 mb-1">备注</label>
      <input
        value={note ?? ''}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        className={inputCls}
      />

      <div className="mt-3">
        <label className="block text-xs text-ink-500 mb-1">小票/图片</label>
        <ImageUploader
          value={imageUrls}
          onChange={setImageUrls}
          namePrefix={ledgerName}
          max={4}
        />
      </div>

      <label className="block text-xs text-ink-500 mt-3 mb-1">发生时间</label>
      <input
        type="datetime-local"
        value={occurredAt}
        onChange={(e) => setOccurredAt(e.target.value)}
        className={inputCls}
      />

      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
          取消
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
        >
          {saving ? '保存中…' : submitText}
        </button>
      </div>
    </>
  );
}

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function RecordModal({
  ledgerId,
  ledgerName,
  customCategoriesJson,
  onClose,
  onSaved,
  onManageCategories,
}: {
  ledgerId: string;
  ledgerName: string;
  customCategoriesJson: string | null;
  onClose: () => void;
  onSaved: () => void;
  onManageCategories: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(data: Parameters<Parameters<typeof EntryForm>[0]['onSubmit']>[0]) {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '保存失败');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <EntryForm
        ledgerName={ledgerName}
        customCategoriesJson={customCategoriesJson}
        saving={saving}
        error={error}
        onSubmit={submit}
        onCancel={onClose}
        onManageCategories={onManageCategories}
        submitText="保存"
      />
    </ModalShell>
  );
}

function EditEntryModal({
  ledgerId,
  customCategoriesJson,
  entry,
  onClose,
  onSaved,
}: {
  ledgerId: string;
  customCategoriesJson: string | null;
  entry: Entry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(data: Parameters<Parameters<typeof EntryForm>[0]['onSubmit']>[0]) {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '保存失败');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <EntryForm
        ledgerName="编辑记录"
        customCategoriesJson={customCategoriesJson}
        initial={entry}
        saving={saving}
        error={error}
        onSubmit={submit}
        onCancel={onClose}
        submitText="保存修改"
      />
    </ModalShell>
  );
}

// ==================== 类别管理 ====================

function CategoryManagerModal({
  ledgerId,
  customCategoriesJson,
  onClose,
  onSaved,
}: {
  ledgerId: string;
  customCategoriesJson: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, setState] = useState<CustomCategoriesJson>(() =>
    parseCustom(customCategoriesJson),
  );
  const [tab, setTab] = useState<GeneralCategoryDirection>('expense');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const alert = useAlert();
  const toast = useToast();

  const effective = useMemo(
    () => effectiveCategories(JSON.stringify(state), tab),
    [state, tab],
  );

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function batchDelete() {
    if (selected.size === 0) return;
    const names = [...selected];
    const ok = await confirm({
      title: `删除 ${names.length} 个类别？`,
      body: `${names.join('、')}\n\n已有的记账条目不会受影响，只是这些类别不再出现在选择列表里。`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    setState((prev) => {
      // 从 added 里过滤掉，同时把预设加入 hidden
      const addedFiltered = prev.added.filter((c) => !selected.has(c.name));
      const hidden = new Set(prev.hidden);
      for (const n of selected) hidden.add(n);
      return { added: addedFiltered, hidden: [...hidden] };
    });
    setSelected(new Set());
  }

  function addNew(cat: GeneralCategory) {
    setState((prev) => {
      // 如果之前是隐藏的同名，取消隐藏
      const hidden = prev.hidden.filter((h) => h !== cat.name);
      const withoutSame = prev.added.filter((a) => a.name !== cat.name);
      return { added: [...withoutSame, cat], hidden };
    });
    setShowAdd(false);
    toast({ message: `已添加类别 "${cat.name}"`, kind: 'success' });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customCategories: state }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '保存失败');
      onSaved();
    } catch (e) {
      await alert({
        title: '保存失败',
        body: e instanceof Error ? e.message : '未知错误',
        danger: true,
      });
    } finally {
      setSaving(false);
    }
  }

  async function resetAll() {
    const ok = await confirm({
      title: '还原所有默认类别？',
      body: '会取消所有隐藏，但保留已添加的自定义类别。',
      confirmText: '还原',
    });
    if (!ok) return;
    setState((prev) => ({ ...prev, hidden: [] }));
    setSelected(new Set());
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-lg font-medium">管理类别</h3>
        <button onClick={resetAll} className="text-xs text-ink-500 underline">
          还原默认
        </button>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => {
            setTab('expense');
            setSelected(new Set());
          }}
          className={`flex-1 py-2 rounded-2xl text-sm ${
            tab === 'expense'
              ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
              : 'bg-ink-50 dark:bg-ink-800'
          }`}
        >
          支出
        </button>
        <button
          onClick={() => {
            setTab('income');
            setSelected(new Set());
          }}
          className={`flex-1 py-2 rounded-2xl text-sm ${
            tab === 'income'
              ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
              : 'bg-ink-50 dark:bg-ink-800'
          }`}
        >
          收入
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {effective.map((c) => {
          const isSel = selected.has(c.name);
          return (
            <button
              key={c.name}
              onClick={() => toggle(c.name)}
              className={`p-3 rounded-2xl text-center transition relative border-2 ${
                isSel
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-400'
                  : 'bg-ink-50 dark:bg-ink-800 border-transparent'
              }`}
            >
              <div className="text-2xl leading-none">{c.icon}</div>
              <div className="text-[11px] mt-1 truncate">{c.name}</div>
              {isSel && (
                <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                  ✓
                </div>
              )}
            </button>
          );
        })}
        <button
          onClick={() => setShowAdd(true)}
          className="p-3 rounded-2xl border-2 border-dashed border-ink-300 dark:border-ink-600 text-ink-500 text-xs flex items-center justify-center min-h-[64px]"
        >
          + 新增
        </button>
      </div>

      {selected.size > 0 && (
        <button
          onClick={batchDelete}
          className="w-full py-2.5 rounded-2xl bg-red-500 text-white text-sm font-medium mb-3"
        >
          删除选中 ({selected.size})
        </button>
      )}

      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
          取消
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>

      {showAdd && (
        <AddCategoryModal
          direction={tab}
          existingNames={effective.map((c) => c.name)}
          onCancel={() => setShowAdd(false)}
          onAdd={addNew}
        />
      )}
    </ModalShell>
  );
}

function AddCategoryModal({
  direction,
  existingNames,
  onCancel,
  onAdd,
}: {
  direction: GeneralCategoryDirection;
  existingNames: string[];
  onCancel: () => void;
  onAdd: (c: GeneralCategory) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('🌟');
  const [error, setError] = useState('');

  function confirmAdd() {
    const n = name.trim();
    if (!n) {
      setError('请输入类别名');
      return;
    }
    if (n.length > 12) {
      setError('类别名不超过 12 个字符');
      return;
    }
    if (existingNames.includes(n)) {
      setError('该类别名已存在');
      return;
    }
    onAdd({ name: n, icon, direction });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-md"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium mb-4">
          新增{direction === 'expense' ? '支出' : '收入'}类别
        </h3>

        <label className="block text-xs text-ink-500 mb-1">类别名</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          placeholder="例：健身、买菜、副业A"
          maxLength={12}
          className={inputCls}
        />

        <label className="block text-xs text-ink-500 mt-4 mb-2">
          图标（当前 <span className="text-lg">{icon}</span>）
        </label>
        <div className="space-y-3 max-h-[40dvh] overflow-y-auto rounded-2xl bg-ink-50 dark:bg-ink-800 p-2">
          {ICON_LIBRARY.map((g) => (
            <div key={g.group}>
              <div className="text-[10px] text-ink-500 px-1 mb-1">{g.group}</div>
              <div className="grid grid-cols-8 gap-1">
                {g.icons.map((emo) => (
                  <button
                    key={emo}
                    onClick={() => setIcon(emo)}
                    className={`aspect-square rounded-lg text-xl leading-none flex items-center justify-center transition ${
                      icon === emo
                        ? 'bg-ink-900 dark:bg-ink-100 ring-2 ring-ink-500'
                        : 'bg-white dark:bg-ink-700'
                    }`}
                  >
                    {emo}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800"
          >
            取消
          </button>
          <button
            onClick={confirmAdd}
            className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({
  ledger,
  onClose,
  onSaved,
  onManageCategories,
}: {
  ledger: LedgerMeta;
  onClose: () => void;
  onSaved: () => void;
  onManageCategories: () => void;
}) {
  const [name, setName] = useState(ledger.name);
  const [budgetYuan, setBudgetYuan] = useState(
    ledger.budgetCents ? (ledger.budgetCents / 100).toFixed(2) : '',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    if (!name.trim()) {
      setError('名称不能为空');
      return;
    }
    const body: Record<string, unknown> = { name: name.trim() };
    if (budgetYuan.trim()) {
      const cents = Math.round(Number(budgetYuan) * 100);
      if (!Number.isFinite(cents) || cents < 0) {
        setError('预算格式不正确');
        return;
      }
      body.budgetCents = cents;
    } else {
      body.budgetCents = null;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/ledgers/${ledger.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-lg font-medium mb-4">账本设置</h3>

      <label className="block text-xs text-ink-500 mb-1">名称</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={50}
        className={inputCls}
      />

      <label className="block text-xs text-ink-500 mt-3 mb-1">月度预算（元，留空关闭）</label>
      <input
        inputMode="decimal"
        value={budgetYuan}
        onChange={(e) => setBudgetYuan(e.target.value)}
        placeholder="0"
        className={inputCls}
      />

      <button
        onClick={onManageCategories}
        className="mt-4 w-full py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 text-sm text-left px-4 flex items-center justify-between"
      >
        <span>管理类别</span>
        <span className="text-ink-400">›</span>
      </button>

      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
          取消
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
        >
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
      <p className="mt-3 text-[11px] text-ink-400 text-center">
        删除操作已迁移到「添加 / 删除账本」页面
      </p>
    </ModalShell>
  );
}

const inputCls =
  'w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400';
