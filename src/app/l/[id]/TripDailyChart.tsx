'use client';

import { useMemo } from 'react';
import type { DailyPoint } from './TravelView';

// 零依赖内联 SVG 柱状图：按天展示本位币花费走势。
// 不引图表库（契合项目"少依赖、离线优先"），纯 SVG，离线可渲染。

const VB_W = 340;
const VB_H = 150;
const PAD_L = 6;
const PAD_R = 6;
const PAD_T = 18;
const PAD_B = 22;

function fmt(cents: number) {
  return (cents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export default function TripDailyChart({
  daily,
  baseCurrency,
  startDate,
  endDate,
}: {
  daily: DailyPoint[];
  baseCurrency: string;
  startDate: string | null;
  endDate: string | null;
}) {
  const model = useMemo(() => {
    const byDate = new Map(daily.map((d) => [d.date, d.cents]));

    // 日期区间：有行程起止就用起止；否则用数据的最小/最大日。
    let from: string;
    let to: string;
    if (daily.length === 0) {
      from = '';
      to = '';
    } else if (startDate && endDate) {
      from = startDate.slice(0, 10);
      to = endDate.slice(0, 10);
    } else {
      const sorted = [...daily].sort((a, b) => (a.date < b.date ? -1 : 1));
      from = sorted[0]!.date;
      to = sorted[sorted.length - 1]!.date;
    }

    const days: { date: string; cents: number }[] = [];
    if (from && to) {
      const cur = new Date(from + 'T00:00:00');
      const last = new Date(to + 'T00:00:00');
      // 防御：区间过大（> 400 天）时退化为仅展示有数据的日子，避免渲染爆炸
      if ((last.getTime() - cur.getTime()) / 86400000 <= 400) {
        while (cur <= last) {
          const key = cur.toISOString().slice(0, 10);
          days.push({ date: key, cents: byDate.get(key) ?? 0 });
          cur.setDate(cur.getDate() + 1);
        }
      } else {
        for (const d of daily) days.push({ date: d.date, cents: d.cents });
      }
    } else {
      for (const d of daily) days.push({ date: d.date, cents: d.cents });
    }

    const maxCents = days.reduce((m, d) => Math.max(m, d.cents), 0);
    const total = days.reduce((s, d) => s + d.cents, 0);
    return { days, maxCents, total };
  }, [daily, startDate, endDate]);

  if (model.days.length === 0) {
    return (
      <div className="text-center text-xs text-ink-400 py-6">还没有花费记录</div>
    );
  }

  const plotW = VB_W - PAD_L - PAD_R;
  const plotH = VB_H - PAD_T - PAD_B;
  const n = model.days.length;
  const slot = plotW / n;
  const barW = Math.max(2, Math.min(slot * 0.7, 22));

  // 选几个日期刻度（首、中、尾），避免密密麻麻
  const tickIdx = new Set<number>();
  if (n > 0) tickIdx.add(0);
  if (n > 1) tickIdx.add(Math.floor((n - 1) / 2));
  if (n > 1) tickIdx.add(n - 1);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-xs text-ink-500">每日花费（{baseCurrency}）</div>
        <div className="num text-xs text-ink-500">
          合计 <span className="font-medium text-ink-700 dark:text-ink-200">{fmt(model.total)}</span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        className="block"
        role="img"
        aria-label="每日花费柱状图"
      >
        {/* 基线 */}
        <line
          x1={PAD_L}
          y1={PAD_T + plotH}
          x2={VB_W - PAD_R}
          y2={PAD_T + plotH}
          stroke="#e5e7eb"
          strokeWidth={1}
        />
        {model.days.map((d, i) => {
          const h = model.maxCents > 0 ? (d.cents / model.maxCents) * plotH : 0;
          const x = PAD_L + slot * i + (slot - barW) / 2;
          const y = PAD_T + plotH - h;
          const mmdd = d.date.slice(5);
          return (
            <g key={d.date}>
              <title>
                {d.date}：{fmt(d.cents)} {baseCurrency}
              </title>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(0, h)}
                rx={2}
                fill={d.cents > 0 ? '#10b981' : '#eef2f1'}
              />
              {tickIdx.has(i) && (
                <text
                  x={PAD_L + slot * i + slot / 2}
                  y={VB_H - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#9ca3af"
                >
                  {mmdd}
                </text>
              )}
            </g>
          );
        })}
        {model.maxCents > 0 && (
          <text x={PAD_L} y={PAD_T - 6} fontSize={9} fill="#9ca3af">
            峰值 {fmt(model.maxCents)}
          </text>
        )}
      </svg>
    </div>
  );
}
