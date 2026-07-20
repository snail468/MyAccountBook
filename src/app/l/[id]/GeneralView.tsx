'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Money from '@/components/ui/Money';
import Lightbox from '@/components/ui/Lightbox';
import { formatShort, localInputToISO, toLocalInput } from '@/lib/datetime';
import { yuanToCents } from '@/lib/money';
import {
  ALL_GENERAL_CATEGORIES,
  GENERAL_EXPENSE_CATEGORIES,
  GENERAL_INCOME_CATEGORIES,
  iconOf,
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
};

export default function GeneralView({
  ledger,
  entries,
}: {
  ledger: LedgerMeta;
  entries: Entry[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showRecord, setShowRecord] = useState(false);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 本月过滤
  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, []);
  const thisMonth = entries.filter(
    (e) => new Date(e.occurredAt).getTime() >= monthStart.getTime(),
  );
  const income = thisMonth
    .filter((e) => e.direction === 'income')
    .reduce((a, e) => a + e.amountCents, 0);
  const expense = thisMonth
    .filter((e) => e.direction === 'expense')
    .reduce((a, e) => a + e.amountCents, 0);
  const net = income - expense;

  // 类别排行
  const byCat = new Map<string, number>();
  for (const e of thisMonth.filter((e) => e.direction === 'expense')) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amountCents);
  }
  const topCats = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // 按天分组
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

  async function del(entryId: string, name: string, amount: number) {
    if (!confirm(`删除 "${name}" ${(amount / 100).toFixed(2)} 元？`)) return;
    const res = await fetch(`/api/ledgers/${ledger.id}/entries/${entryId}`, {
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
                      <span>{iconOf(cat)}</span>
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
                    onDelete={() => del(e.id, e.category, e.amountCents)}
                    onZoomImage={setZoomImg}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {showRecord && (
        <RecordModal
          ledgerId={ledger.id}
          ledgerName={ledger.name}
          onClose={() => setShowRecord(false)}
          onSaved={() => {
            setShowRecord(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          ledger={ledger}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setShowSettings(false);
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
  onDelete,
  onZoomImage,
}: {
  entry: Entry;
  onDelete: () => void;
  onZoomImage: (url: string) => void;
}) {
  const isIncome = entry.direction === 'income';
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
      <div className="w-9 h-9 rounded-xl bg-ink-50 dark:bg-ink-700 flex items-center justify-center text-lg shrink-0">
        {iconOf(entry.category)}
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
        onClick={onDelete}
        className="text-ink-300 hover:text-red-500 text-xs px-1"
        aria-label="删除"
      >
        ✕
      </button>
    </div>
  );
}

function RecordModal({
  ledgerId,
  ledgerName,
  onClose,
  onSaved,
}: {
  ledgerId: string;
  ledgerName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState<'expense' | 'income'>('expense');
  const [category, setCategory] = useState<string>('餐饮');
  const [customCategoryMode, setCustomCategoryMode] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [occurredAt, setOccurredAt] = useState(toLocalInput(new Date()));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const options =
    direction === 'expense' ? GENERAL_EXPENSE_CATEGORIES : GENERAL_INCOME_CATEGORIES;

  async function save() {
    setError('');
    const cents = yuanToCents(amount);
    if (cents === null || cents === 0) {
      setError('金额格式不正确');
      return;
    }
    const finalCategory = customCategoryMode ? customCategory.trim() : category;
    if (!finalCategory) {
      setError('请选择类别');
      return;
    }
    // 自定义类别方向以当前 toggle 为准
    const finalDirection = ALL_GENERAL_CATEGORIES.find((c) => c.name === finalCategory)?.direction ?? direction;

    setSaving(true);
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: finalDirection,
          category: finalCategory,
          amountCents: cents,
          tags: tags.trim() || null,
          note: note.trim() || null,
          imageUrls,
          occurredAt: localInputToISO(occurredAt),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
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
        <h3 className="text-lg font-medium mb-4">{ledgerName} · 记一笔</h3>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => {
              setDirection('expense');
              setCategory('餐饮');
              setCustomCategoryMode(false);
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
              setCategory('工资');
              setCustomCategoryMode(false);
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

        <label className="block text-xs text-ink-500 mb-1">类别</label>
        {customCategoryMode ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="自定义类别名"
              maxLength={20}
              className={inputCls}
            />
            <button
              onClick={() => setCustomCategoryMode(false)}
              className="px-3 rounded-2xl bg-ink-50 dark:bg-ink-800 text-sm"
            >
              返回
            </button>
          </div>
        ) : (
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
                <div className="text-[10px] mt-1">{c.name}</div>
              </button>
            ))}
            <button
              onClick={() => setCustomCategoryMode(true)}
              className="p-2 rounded-2xl border-2 border-dashed border-ink-300 dark:border-ink-600 text-ink-500 text-[10px]"
            >
              + 自定义
            </button>
          </div>
        )}

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
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          maxLength={200}
          placeholder="午饭, 同事"
          className={inputCls}
        />

        <label className="block text-xs text-ink-500 mt-3 mb-1">备注</label>
        <input
          value={note}
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
      </div>
    </div>
  );
}

function SettingsModal({
  ledger,
  onClose,
  onSaved,
}: {
  ledger: LedgerMeta;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
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

  async function del() {
    if (!confirm(`删除账本 "${ledger.name}"？所有记录会一并清除，且不可恢复！`)) return;
    setBusy(true);
    const res = await fetch(`/api/ledgers/${ledger.id}`, { method: 'DELETE' });
    if (res.ok) {
      window.location.href = '/';
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '删除失败');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
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
        <button
          onClick={del}
          disabled={busy}
          className="mt-3 w-full py-2.5 rounded-2xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm disabled:opacity-50"
        >
          删除此账本
        </button>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400';
