'use client';

// 月度收支趋势的双折线图。
//
// 用内联 SVG 手画，不引图表库 —— 一个个人账本不值得为两条折线加 100KB 依赖
// （项目其它地方也是这个取舍，见 logger.ts 的同类说明）。
//
// 金额是敏感信息：全局有「隐藏金额」开关（UIProvider），隐藏时纵轴刻度和 tooltip
// 都不能露出具体数字，但**折线形状照常显示** —— 趋势本身不算敏感，
// 而且藏掉形状这个图就没意义了。

import { useState } from 'react';
import { formatYuan } from '@/lib/money';
import { useUI } from '@/components/ui/UIProvider';
import type { MonthBucket } from '@/lib/stats';

const W = 320;
const H = 120;
const PAD_X = 6;
const PAD_Y = 10;

function pointsOf(values: number[], max: number): { x: number; y: number }[] {
  if (values.length === 0) return [];
  const usableW = W - PAD_X * 2;
  const usableH = H - PAD_Y * 2;
  const step = values.length > 1 ? usableW / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: PAD_X + step * i,
    // max 为 0 时全部压在底部，不做除零
    y: PAD_Y + usableH - (max > 0 ? (v / max) * usableH : 0),
  }));
}

const toPath = (pts: { x: number; y: number }[]) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

export default function TrendChart({ buckets }: { buckets: MonthBucket[] }) {
  const { amountsVisible, ready } = useUI();
  const [active, setActive] = useState<number | null>(null);

  const incomes = buckets.map((b) => b.income);
  const expenses = buckets.map((b) => b.expense);
  // 两条线共用一个纵轴，否则"收入线比支出线高"会变成视觉谎言
  const max = Math.max(...incomes, ...expenses, 0);

  const incomePts = pointsOf(incomes, max);
  const expensePts = pointsOf(expenses, max);
  const showMoney = ready && amountsVisible;
  const cur = active !== null ? buckets[active] : null;

  return (
    <div>
      <div className="flex items-center gap-4 text-[11px] text-ink-500 mb-2">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-emerald-500" />
          收入
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-ink-900 dark:bg-ink-100" />
          支出
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="月度收支趋势"
      >
        {/* 基准线 */}
        <line
          x1={PAD_X}
          y1={H - PAD_Y}
          x2={W - PAD_X}
          y2={H - PAD_Y}
          className="stroke-ink-200 dark:stroke-ink-700"
          strokeWidth="1"
        />
        <path
          d={toPath(incomePts)}
          fill="none"
          className="stroke-emerald-500"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={toPath(expensePts)}
          fill="none"
          className="stroke-ink-900 dark:stroke-ink-100"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* 命中区：整列可点，比只点线上那个 2px 的圆点好按得多（手机上尤其） */}
        {buckets.map((b, i) => {
          const w = (W - PAD_X * 2) / Math.max(1, buckets.length);
          return (
            <rect
              key={b.key}
              x={PAD_X + w * i}
              y={0}
              width={w}
              height={H}
              fill="transparent"
              onClick={() => setActive(active === i ? null : i)}
              className="cursor-pointer"
            />
          );
        })}
        {active !== null && incomePts[active] && (
          <>
            <line
              x1={incomePts[active].x}
              y1={PAD_Y}
              x2={incomePts[active].x}
              y2={H - PAD_Y}
              className="stroke-ink-300 dark:stroke-ink-600"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle cx={incomePts[active].x} cy={incomePts[active].y} r="3" className="fill-emerald-500" />
            <circle
              cx={expensePts[active].x}
              cy={expensePts[active].y}
              r="3"
              className="fill-ink-900 dark:fill-ink-100"
            />
          </>
        )}
      </svg>

      <div className="flex justify-between text-[10px] text-ink-400 mt-1">
        {/* 只标首尾和中间，12 个月标签全画会挤成一团 */}
        <span>{buckets[0]?.key.slice(2)}</span>
        <span>{buckets[Math.floor(buckets.length / 2)]?.key.slice(2)}</span>
        <span>{buckets[buckets.length - 1]?.key.slice(2)}</span>
      </div>

      <div className="mt-2 text-xs min-h-[1.5rem]">
        {cur ? (
          <span className="text-ink-500">
            {cur.key} · 收入{' '}
            <span className="text-emerald-600 dark:text-emerald-400">
              {showMoney ? formatYuan(cur.income) : '·····'}
            </span>{' '}
            · 支出{' '}
            <span className="text-ink-900 dark:text-ink-100">
              {showMoney ? formatYuan(cur.expense) : '·····'}
            </span>
          </span>
        ) : (
          <span className="text-ink-400">点一下柱子看单月明细</span>
        )}
      </div>
    </div>
  );
}
