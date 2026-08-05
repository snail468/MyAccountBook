'use client';

import { useState } from 'react';
// 从 currencyList 而不是 currency 导入 —— 后者 import 了 prisma，
// 客户端组件引它会把服务端代码拖进客户端模块图
import { COMMON_CURRENCIES } from '@/lib/currencyList';
import { localInputToISO } from '@/lib/datetime';

type Kind = 'work' | 'taoyuan' | 'general' | 'travel';

type Preset = {
  kind: Kind;
  name: string;
  icon: string;
  desc: string;
};

const PRESETS: Preset[] = [
  {
    kind: 'work',
    name: '工作账本',
    icon: '💼',
    desc: '按月记录进项与出项，用于工资、垫款等',
  },
  {
    kind: 'taoyuan',
    name: '桃源账本',
    icon: '🌸',
    desc: '活动流水线：发布 → 预测 → 公示 → 到账',
  },
  {
    kind: 'general',
    name: '普通账本',
    icon: '📒',
    desc: '日常收支：餐饮/交通/购物…含月度预算与统计',
  },
  {
    kind: 'travel',
    name: '旅游账本',
    icon: '✈️',
    desc: '按行程组织：多币种 + 多人 AA + 最优结算',
  },
  {
    kind: 'general',
    name: '自定义账本',
    icon: '📝',
    desc: '基于普通账本模型，自选名称与图标',
  },
];

const ICONS = ['📒', '💰', '🎁', '🎬', '🍜', '🏠', '🚗', '📚', '💄', '🎮', '🐱', '💎'];

export default function PresetPicker({
  hasWork,
  hasTaoyuan,
}: {
  hasWork: boolean;
  hasTaoyuan: boolean;
}) {
  const [picked, setPicked] = useState<Preset | null>(null);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📒');
  const [budgetYuan, setBudgetYuan] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('CNY');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function pick(p: Preset) {
    setPicked(p);
    setName(p.name);
    setIcon(p.icon);
    setBudgetYuan('');
    setBaseCurrency('CNY');
    setStartAt('');
    setEndAt('');
    setError('');
  }

  async function submit() {
    if (!picked) return;
    setError('');
    if (!name.trim()) {
      setError('请填写账本名');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        kind: picked.kind,
        name: name.trim(),
        icon,
      };
      if (picked.kind === 'general' && budgetYuan.trim()) {
        const cents = Math.round(Number(budgetYuan) * 100);
        if (!Number.isFinite(cents) || cents < 0) {
          setError('预算格式不正确');
          setSaving(false);
          return;
        }
        body.budgetCents = cents;
      }
      if (picked.kind === 'travel') {
        body.baseCurrency = baseCurrency;
        body.startDate = localInputToISO(startAt);
        body.endDate = localInputToISO(endAt);
      }
      const res = await fetch('/api/ledgers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '添加失败');
      // work / taoyuan 内置账本回首页；其它跳到该账本
      if (picked.kind === 'work') {
        window.location.href = '/work';
      } else if (picked.kind === 'taoyuan') {
        window.location.href = '/taoyuan';
      } else {
        window.location.href = `/l/${data.id}`;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败');
    } finally {
      setSaving(false);
    }
  }

  if (picked) {
    return (
      <div>
        <button onClick={() => setPicked(null)} className="text-ink-500 text-sm mb-4">
          ‹ 换一个
        </button>
        <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-ink-50 dark:bg-ink-700 flex items-center justify-center text-2xl">
              {icon}
            </div>
            <div>
              <div className="text-base font-medium">{picked.name}</div>
              <div className="text-xs text-ink-500">{picked.desc}</div>
            </div>
          </div>

          <label className="block text-xs text-ink-500 mb-1">账本名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            className={inputCls}
          />

          <label className="block text-xs text-ink-500 mt-3 mb-1">图标</label>
          <div className="flex flex-wrap gap-2">
            {ICONS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                className={`w-11 h-11 rounded-2xl text-xl flex items-center justify-center ${
                  icon === i
                    ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                    : 'bg-ink-50 dark:bg-ink-800'
                }`}
              >
                {i}
              </button>
            ))}
          </div>

          {picked.kind === 'general' && (
            <>
              <label className="block text-xs text-ink-500 mt-4 mb-1">月度预算（可选，元）</label>
              <input
                inputMode="decimal"
                placeholder="0"
                value={budgetYuan}
                onChange={(e) => setBudgetYuan(e.target.value)}
                className={inputCls}
              />
            </>
          )}

          {picked.kind === 'travel' && (
            <>
              <label className="block text-xs text-ink-500 mt-4 mb-1">本币</label>
              <select
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                className={inputCls}
              >
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div>
                  <label className="block text-xs text-ink-500 mb-1">起始</label>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-500 mb-1">结束</label>
                  <input
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            </>
          )}

          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

          <button
            onClick={submit}
            disabled={saving}
            className="mt-5 w-full py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 font-medium disabled:opacity-50"
          >
            {saving ? '创建中…' : '创建账本'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {PRESETS.map((p, i) => {
        const disabled =
          (p.kind === 'work' && hasWork) || (p.kind === 'taoyuan' && hasTaoyuan);
        return (
          <button
            key={i}
            onClick={() => !disabled && pick(p)}
            disabled={disabled}
            className={`w-full text-left flex items-center gap-3 p-5 rounded-2xl border transition ${
              disabled
                ? 'bg-ink-50 dark:bg-ink-800 border-ink-200 dark:border-ink-700 opacity-50'
                : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700 active:scale-[0.98]'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-ink-50 dark:bg-ink-700 flex items-center justify-center text-2xl">
              {p.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-medium">
                {p.name}
                {disabled && <span className="text-xs text-ink-400 ml-2">已添加</span>}
              </div>
              <div className="text-xs text-ink-500 mt-0.5">{p.desc}</div>
            </div>
            {!disabled && <span className="text-ink-400">›</span>}
          </button>
        );
      })}
    </div>
  );
}

const inputCls =
  'w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400';
