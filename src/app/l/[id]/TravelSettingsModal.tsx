'use client';

import { useState } from 'react';
import ModalShell from './general/ModalShell';
import { inputCls } from './general/styles';
import { COMMON_CURRENCIES } from '@/lib/currencyList';

type TravelLedgerMeta = {
  id: string;
  name: string;
  icon: string | null;
  baseCurrency: string;
  startDate: string | null;
  endDate: string | null;
  tripBudget: string | null;
};

type CurrencyTotal = { currency: string; foreignCents: number };

/** ISO(UTC) → 本地 YYYY-MM-DD，供 <input type="date"> 展示 */
function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 本地 YYYY-MM-DD → ISO(UTC 午夜)，空串返回 null。与 toDateInput 互逆（本地时区下）。 */
function fromDateInput(v: string): string | null {
  if (!v) return null;
  return new Date(`${v}T00:00:00`).toISOString();
}

/** 把存库的 tripBudget JSON 解析成表单初始值（元为单位的字符串，便于 <input> 编辑）。 */
function parseInitialTripBudget(json: string | null): {
  totalBaseYuan: string;
  perCur: Record<string, string>;
} {
  if (!json) return { totalBaseYuan: '', perCur: {} };
  try {
    const p = JSON.parse(json) as { totalBaseCents?: number | null; perCurrency?: Record<string, number> };
    const perCur: Record<string, string> = {};
    if (p.perCurrency) {
      for (const [c, v] of Object.entries(p.perCurrency)) perCur[c] = String(v / 100);
    }
    return {
      totalBaseYuan: p.totalBaseCents != null ? String(p.totalBaseCents / 100) : '',
      perCur,
    };
  } catch {
    return { totalBaseYuan: '', perCur: {} };
  }
}

export default function TravelSettingsModal({
  ledger,
  currencyTotals,
  onClose,
  onSaved,
}: {
  ledger: TravelLedgerMeta;
  currencyTotals: CurrencyTotal[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(ledger.name);
  const [icon, setIcon] = useState(ledger.icon ?? '✈️');
  const [baseCurrency, setBaseCurrency] = useState(ledger.baseCurrency);
  const [startDate, setStartDate] = useState(toDateInput(ledger.startDate));
  const [endDate, setEndDate] = useState(toDateInput(ledger.endDate));
  const init = parseInitialTripBudget(ledger.tripBudget);
  const [totalBaseYuan, setTotalBaseYuan] = useState(init.totalBaseYuan);
  const [perCur, setPerCur] = useState<Record<string, string>>(init.perCur);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    if (!name.trim()) {
      setError('名称不能为空');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setError('结束日期不能早于开始日期');
      return;
    }

    // 多币种预算：解析并校验所有数字输入
    const totalEmpty = totalBaseYuan.trim() === '';
    let totalBaseCents: number | null = null;
    if (!totalEmpty) {
      const n = Number(totalBaseYuan);
      if (!isFinite(n) || n < 0) {
        setError('总预算需为非负数字');
        return;
      }
      totalBaseCents = Math.round(n * 100);
    }
    const perCurrency: Record<string, number> = {};
    for (const [c, v] of Object.entries(perCur)) {
      if (v.trim() === '') continue;
      const n = Number(v);
      if (!isFinite(n) || n < 0) {
        setError(`${c} 预算需为非负数字`);
        return;
      }
      perCurrency[c] = Math.round(n * 100);
    }
    const hasBudget = !totalEmpty || Object.keys(perCurrency).length > 0;
    const tripBudget = hasBudget ? { totalBaseCents, perCurrency } : null;

    const body: Record<string, unknown> = {
      name: name.trim(),
      icon: icon.trim().slice(0, 8) || null,
      baseCurrency,
      startDate: fromDateInput(startDate),
      endDate: fromDateInput(endDate),
      tripBudget,
    };
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

      <label className="block text-xs text-ink-500 mt-3 mb-1">
        图标（emoji，留空用 ✈️）
      </label>
      <input
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
        maxLength={8}
        placeholder="✈️"
        className={inputCls}
      />

      <label className="block text-xs text-ink-500 mt-3 mb-1">本位币</label>
      <select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)} className={inputCls}>
        {COMMON_CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </select>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div>
          <label className="block text-xs text-ink-500 mb-1">行程开始</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-ink-500 mb-1">行程结束</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-ink-200 dark:border-ink-700 pt-3">
        <div className="text-xs text-ink-500 mb-2">预算（多币种）</div>
        <label className="block text-[11px] text-ink-500 mb-1">总预算（{baseCurrency}）</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={totalBaseYuan}
          onChange={(e) => setTotalBaseYuan(e.target.value)}
          placeholder="不限制"
          className={inputCls}
        />
        {currencyTotals.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-[11px] text-ink-500">各币种预算（按原币，留空=不限制）</div>
            {currencyTotals.map((c) => (
              <div key={c.currency} className="flex items-center gap-2">
                <span className="text-xs w-16 text-ink-600 dark:text-ink-300">{c.currency}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={perCur[c.currency] ?? ''}
                  onChange={(e) =>
                    setPerCur((p) => ({ ...p, [c.currency]: e.target.value }))
                  }
                  placeholder="不限制"
                  className={inputCls}
                />
              </div>
            ))}
          </div>
        )}
      </div>

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
