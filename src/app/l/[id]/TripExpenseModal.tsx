'use client';

import { useEffect, useState } from 'react';
import { COMMON_CURRENCIES } from '@/lib/currency';
import { yuanToCents } from '@/lib/money';
import { localInputToISO, toLocalInput } from '@/lib/datetime';
import ImageUploader from '@/app/taoyuan/ImageUploader';
import type { Member } from './TravelView';

// 每个行程本地记住上次用过的汇率（内存级；关掉页面就没）
const rateMemory = new Map<string, number>(); // key: currency, value: rate

const CATEGORIES = ['餐饮', '交通', '住宿', '门票', '购物', '娱乐', '其它'];

type SplitMode = 'even' | 'partial' | 'ratio';

export default function TripExpenseModal({
  ledgerId,
  baseCurrency,
  members,
  defaultPhase,
  onClose,
  onSaved,
}: {
  ledgerId: string;
  baseCurrency: string;
  members: Member[];
  defaultPhase: 'pre' | 'during';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('餐饮');
  const [phase, setPhase] = useState<'pre' | 'during'>(defaultPhase);
  const [currency, setCurrency] = useState(baseCurrency);
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('1');
  const [rateLoading, setRateLoading] = useState(false);
  const [payerId, setPayerId] = useState(members[0]?.id ?? '');
  const [splitMode, setSplitMode] = useState<SplitMode>('even');
  // even/partial: selected member ids
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(
    () => new Set(members.map((m) => m.id)),
  );
  // ratio: memberId → weight
  const [ratios, setRatios] = useState<Record<string, number>>(() => {
    const o: Record<string, number> = {};
    for (const m of members) o[m.id] = 1;
    return o;
  });
  const [note, setNote] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [occurredAt, setOccurredAt] = useState(toLocalInput(new Date()));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // 当币种变化时：先看内存，再拉实时汇率
  useEffect(() => {
    if (currency === baseCurrency) {
      setRate('1');
      return;
    }
    const cached = rateMemory.get(currency);
    if (cached) {
      setRate(String(cached));
      return;
    }
    // 拉汇率
    setRateLoading(true);
    fetch(`/api/currency?base=${baseCurrency}&quote=${currency}`)
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.rate === 'number') {
          setRate(String(data.rate.toFixed(6)));
          rateMemory.set(currency, data.rate);
        }
      })
      .catch(() => {})
      .finally(() => setRateLoading(false));
  }, [currency, baseCurrency]);

  const amountForeignCents = yuanToCents(amount);
  const rateNum = Number(rate);
  const amountBaseCents =
    amountForeignCents !== null && Number.isFinite(rateNum) && rateNum > 0
      ? Math.round(amountForeignCents * rateNum)
      : 0;

  function toggleSelected(id: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setRatio(id: string, v: number) {
    setRatios((prev) => ({ ...prev, [id]: Math.max(0, v) }));
  }

  // 计算分摊数组
  function calcSplits(): { memberId: string; shareCents: number }[] {
    if (amountBaseCents <= 0) return [];
    if (splitMode === 'even' || splitMode === 'partial') {
      const targets = splitMode === 'even'
        ? members.map((m) => m.id)
        : [...selectedMembers];
      if (targets.length === 0) return [];
      const base = Math.floor(amountBaseCents / targets.length);
      const remainder = amountBaseCents - base * targets.length;
      return targets.map((id, i) => ({
        memberId: id,
        shareCents: base + (i < remainder ? 1 : 0),
      }));
    }
    // ratio
    const totalWeight = Object.values(ratios).reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) return [];
    const raw: { memberId: string; share: number }[] = [];
    for (const m of members) {
      const w = ratios[m.id] ?? 0;
      raw.push({ memberId: m.id, share: (amountBaseCents * w) / totalWeight });
    }
    // 四舍五入后校准：把误差累到最后一个非零份额
    const result = raw.map((r) => ({
      memberId: r.memberId,
      shareCents: Math.round(r.share),
    }));
    const sum = result.reduce((a, r) => a + r.shareCents, 0);
    const diff = amountBaseCents - sum;
    if (diff !== 0) {
      const idx = result.findIndex((r) => r.shareCents > 0);
      if (idx >= 0) result[idx].shareCents += diff;
    }
    return result.filter((r) => r.shareCents > 0);
  }

  const splits = calcSplits();

  async function save() {
    setError('');
    if (!title.trim()) {
      setError('请填写事项');
      return;
    }
    if (amountForeignCents === null || amountForeignCents === 0) {
      setError('金额格式不正确');
      return;
    }
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      setError('汇率格式不正确');
      return;
    }
    if (!payerId) {
      setError('请选择付款人');
      return;
    }
    if (splits.length === 0) {
      setError('请选择分摊成员');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category,
          phase,
          currency: currency.toUpperCase(),
          amountForeignCents,
          rate: rateNum,
          payerId,
          splits,
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
        <h3 className="text-lg font-medium mb-4">记一笔</h3>

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setPhase('pre')}
            className={`flex-1 py-2 rounded-2xl text-sm ${
              phase === 'pre'
                ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'bg-ink-50 dark:bg-ink-800'
            }`}
          >
            行前
          </button>
          <button
            onClick={() => setPhase('during')}
            className={`flex-1 py-2 rounded-2xl text-sm ${
              phase === 'during'
                ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'bg-ink-50 dark:bg-ink-800'
            }`}
          >
            行中
          </button>
        </div>

        <label className="block text-xs text-ink-500 mb-1">事项 *</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="午饭 · 门票 · 出租车…"
          className={inputCls}
        />

        <label className="block text-xs text-ink-500 mt-3 mb-1">类别</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-xl text-sm ${
                category === c
                  ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                  : 'bg-ink-50 dark:bg-ink-800'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <label className="block text-xs text-ink-500 mb-1">金额</label>
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-ink-500 mb-1">币种</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className={inputCls}
            >
              {COMMON_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
        </div>

        {currency !== baseCurrency && (
          <div className="mt-3 p-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
            <label className="block text-xs text-ink-500 mb-1">
              汇率（1 {currency} = ? {baseCurrency}）
              {rateLoading && <span className="ml-2">拉取中…</span>}
            </label>
            <input
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 focus:outline-none"
            />
            {amountBaseCents > 0 && (
              <div className="text-xs text-ink-500 mt-2 num">
                ≈ {(amountBaseCents / 100).toFixed(2)} {baseCurrency}
              </div>
            )}
          </div>
        )}

        <label className="block text-xs text-ink-500 mt-3 mb-1">付款人</label>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => setPayerId(m.id)}
              className={`px-3 py-1.5 rounded-xl text-sm ${
                payerId === m.id
                  ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                  : 'bg-ink-50 dark:bg-ink-800'
              }`}
            >
              {m.displayName}
            </button>
          ))}
        </div>

        <label className="block text-xs text-ink-500 mt-3 mb-1">分摊方式</label>
        <div className="flex gap-2 mb-2">
          {(['even', 'partial', 'ratio'] as SplitMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setSplitMode(m)}
              className={`flex-1 py-2 rounded-xl text-xs ${
                splitMode === m
                  ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                  : 'bg-ink-50 dark:bg-ink-800'
              }`}
            >
              {m === 'even' ? '全员平摊' : m === 'partial' ? '部分平摊' : '按比例'}
            </button>
          ))}
        </div>

        {splitMode === 'partial' && (
          <div className="grid grid-cols-2 gap-2">
            {members.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-ink-50 dark:bg-ink-800 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedMembers.has(m.id)}
                  onChange={() => toggleSelected(m.id)}
                  className="w-4 h-4"
                />
                <span className="truncate">{m.displayName}</span>
              </label>
            ))}
          </div>
        )}

        {splitMode === 'ratio' && (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg bg-ink-50 dark:bg-ink-800">
                <span className="text-sm flex-1 truncate">{m.displayName}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={ratios[m.id] ?? 0}
                  onChange={(e) => setRatio(m.id, Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-sm text-right"
                />
                <span className="text-xs text-ink-500">份</span>
              </div>
            ))}
          </div>
        )}

        {splits.length > 0 && (
          <div className="mt-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-xs text-emerald-800 dark:text-emerald-300">
            分摊结果：
            {splits.map((s, i) => {
              const m = members.find((x) => x.id === s.memberId);
              return (
                <span key={s.memberId}>
                  {i > 0 && ' · '}
                  {m?.displayName} {(s.shareCents / 100).toFixed(2)}
                </span>
              );
            })}
          </div>
        )}

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
            namePrefix={title || '旅游图片'}
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

const inputCls =
  'w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400';
