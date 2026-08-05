'use client';

// 周期记账的规则管理。
//
// 生成时机不在这个页面 —— 打开首页时会自动补齐（见 lib/recurringRun.ts）。
// 这里额外给一个「立即生成」按钮，供用户改完规则想马上看到结果时用。

import { useCallback, useEffect, useState } from 'react';
import { useAlert, useConfirm } from '@/components/ui/Dialog';
import { formatYuan } from '@/lib/money';
import { describeSchedule, upcomingDate } from '@/lib/recurring';

type Rule = {
  id: string;
  target: string;
  ledgerId: string | null;
  ledger: { id: string; name: string } | null;
  direction: string;
  category: string;
  amountCents: number;
  note: string | null;
  frequency: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: string;
  endDate: string | null;
  autoCreate: boolean;
  active: boolean;
  lastGeneratedAt: string | null;
};

type Ledger = { id: string; name: string };

const inputCls =
  'w-full px-3 py-2 rounded-xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function RecurringClient({ ledgers }: { ledgers: Ledger[] }) {
  const confirm = useConfirm();
  const alert = useAlert();

  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    target: (ledgers.length > 0 ? 'general' : 'work') as 'work' | 'general',
    ledgerId: ledgers[0]?.id ?? '',
    direction: 'expense' as 'income' | 'expense',
    category: '',
    amountYuan: '',
    note: '',
    frequency: 'monthly' as 'monthly' | 'weekly',
    dayOfMonth: 1,
    dayOfWeek: 1,
    startDate: todayISO(),
    endDate: '',
    autoCreate: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recurring', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setRules(data.rules);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setError('');
    const yuan = Number(form.amountYuan);
    if (!Number.isFinite(yuan) || yuan <= 0) {
      setError('金额要是正数');
      return;
    }
    try {
      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: form.target,
          ledgerId: form.target === 'general' ? form.ledgerId : null,
          direction: form.direction,
          category: form.category,
          amountCents: Math.round(yuan * 100),
          note: form.note || null,
          frequency: form.frequency,
          dayOfMonth: form.frequency === 'monthly' ? Number(form.dayOfMonth) : null,
          dayOfWeek: form.frequency === 'weekly' ? Number(form.dayOfWeek) : null,
          startDate: new Date(form.startDate + 'T00:00:00').toISOString(),
          endDate: form.endDate ? new Date(form.endDate + 'T00:00:00').toISOString() : null,
          autoCreate: form.autoCreate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      setAdding(false);
      setForm({ ...form, category: '', amountYuan: '', note: '' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    }
  }

  async function toggle(r: Rule, field: 'active' | 'autoCreate') {
    await fetch(`/api/recurring/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !r[field] }),
    });
    await load();
  }

  async function remove(r: Rule) {
    const ok = await confirm({
      title: `删除「${r.category}」这条规则？`,
      body: '已经生成的账目不会被删除 —— 那些是真实发生过的支出。',
      danger: true,
      confirmText: '删除规则',
    });
    if (!ok) return;
    await fetch(`/api/recurring/${r.id}`, { method: 'DELETE' });
    await load();
  }

  async function runNow() {
    const res = await fetch('/api/recurring?run=1', { method: 'POST' });
    const data = await res.json();
    await alert({
      title: data.created > 0 ? `已生成 ${data.created} 笔` : '没有到期的规则',
      body:
        data.truncatedRules > 0
          ? `有 ${data.truncatedRules} 条规则积压过多，只补了最近 24 期。`
          : undefined,
    });
    await load();
  }

  return (
    <div className="px-4 pb-24 space-y-3">
      <div className="p-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
        <p className="text-[11px] text-ink-500 leading-relaxed">
          房租、订阅、工资这类固定项配一次就行。
          <strong>打开首页时自动补齐</strong>到期的账 —— 停用一段时间再回来，漏掉的几期会一起补上。
        </p>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {loading && <p className="text-ink-400 text-sm py-6 text-center">加载中…</p>}

      {!loading && rules.length === 0 && !adding && (
        <p className="text-ink-500 text-sm py-8 text-center">还没有周期规则</p>
      )}

      {rules.map((r) => {
        const schedule = {
          frequency: (r.frequency === 'weekly' ? 'weekly' : 'monthly') as 'weekly' | 'monthly',
          dayOfMonth: r.dayOfMonth ?? undefined,
          dayOfWeek: r.dayOfWeek ?? undefined,
          startDate: new Date(r.startDate),
          endDate: r.endDate ? new Date(r.endDate) : null,
        };
        const next = upcomingDate(
          schedule,
          r.lastGeneratedAt ? new Date(r.lastGeneratedAt) : null,
          new Date(),
        );
        return (
          <div
            key={r.id}
            className={`p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 ${
              r.active ? '' : 'opacity-60'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {r.category}
                  <span
                    className={`ml-2 text-sm ${
                      r.direction === 'income'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-ink-500'
                    }`}
                  >
                    {r.direction === 'income' ? '+' : '-'}
                    {formatYuan(r.amountCents)}
                  </span>
                </div>
                <div className="text-xs text-ink-500 mt-1">
                  {describeSchedule(schedule)} ·{' '}
                  {r.target === 'work' ? '工作账本' : (r.ledger?.name ?? '普通账本')}
                </div>
                {r.note && <div className="text-xs text-ink-400 mt-0.5 truncate">{r.note}</div>}
                <div className="text-[11px] text-ink-400 mt-1">
                  {!r.active
                    ? '已停用'
                    : next
                      ? `下次：${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
                      : '已到结束日期'}
                  {r.autoCreate ? '' : ' · 仅提醒不自动记'}
                </div>
              </div>
              <button onClick={() => void remove(r)} className="text-xs text-red-500 shrink-0">
                删除
              </button>
            </div>
            <div className="flex gap-3 mt-3 text-xs">
              <button onClick={() => void toggle(r, 'active')} className="text-ink-500 underline">
                {r.active ? '停用' : '启用'}
              </button>
              <button onClick={() => void toggle(r, 'autoCreate')} className="text-ink-500 underline">
                {r.autoCreate ? '改为仅提醒' : '改为自动记账'}
              </button>
            </div>
          </div>
        );
      })}

      {!loading && rules.length > 0 && (
        <button
          onClick={() => void runNow()}
          className="w-full py-2 rounded-xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-xs text-ink-500"
        >
          立即生成到期的账
        </button>
      )}

      {adding ? (
        <div className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 space-y-2">
          <div className="flex gap-2">
            {(['expense', 'income'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setForm({ ...form, direction: v })}
                className={`flex-1 py-2 rounded-xl text-sm border ${
                  form.direction === v
                    ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 border-transparent'
                    : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700'
                }`}
              >
                {v === 'expense' ? '支出' : '收入'}
              </button>
            ))}
          </div>

          <select
            value={form.target === 'work' ? 'work' : form.ledgerId}
            onChange={(e) =>
              e.target.value === 'work'
                ? setForm({ ...form, target: 'work' })
                : setForm({ ...form, target: 'general', ledgerId: e.target.value })
            }
            className={inputCls}
          >
            <option value="work">工作账本</option>
            {ledgers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>

          <input
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="类别，如 房租"
            className={inputCls}
          />
          <input
            value={form.amountYuan}
            onChange={(e) => setForm({ ...form, amountYuan: e.target.value })}
            placeholder="金额（元）"
            inputMode="decimal"
            className={inputCls}
          />
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="备注（可选）"
            className={inputCls}
          />

          <div className="flex gap-2">
            {(['monthly', 'weekly'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setForm({ ...form, frequency: f })}
                className={`flex-1 py-2 rounded-xl text-sm border ${
                  form.frequency === f
                    ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 border-transparent'
                    : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700'
                }`}
              >
                {f === 'monthly' ? '按月' : '按周'}
              </button>
            ))}
          </div>

          {form.frequency === 'monthly' ? (
            <label className="block text-xs text-ink-500">
              每月几号
              <select
                value={form.dayOfMonth}
                onChange={(e) => setForm({ ...form, dayOfMonth: Number(e.target.value) })}
                className={inputCls}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} 号{n > 28 ? '（不足则当月最后一天）' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-xs text-ink-500">
              每周几
              <select
                value={form.dayOfWeek}
                onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
                className={inputCls}
              >
                {['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex items-center gap-2">
            <label className="flex-1 text-xs text-ink-500">
              开始
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="flex-1 text-xs text-ink-500">
              结束（可选）
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className={inputCls}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-ink-500 pt-1">
            <input
              type="checkbox"
              checked={form.autoCreate}
              onChange={(e) => setForm({ ...form, autoCreate: e.target.checked })}
            />
            到期自动记账（不勾则只在列表里提示）
          </label>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void submit()}
              className="flex-1 py-2 rounded-xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm"
            >
              保存
            </button>
            <button
              onClick={() => setAdding(false)}
              className="px-4 py-2 rounded-xl bg-ink-100 dark:bg-ink-700 text-sm"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        !loading && (
          <button
            onClick={() => setAdding(true)}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-ink-300 dark:border-ink-600 text-ink-500 text-sm"
          >
            ＋ 添加周期规则
          </button>
        )
      )}
    </div>
  );
}
