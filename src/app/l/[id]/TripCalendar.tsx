'use client';

import { useMemo } from 'react';
import type { DailyPoint } from './TravelView';

// 零依赖行程日历：基于 ledger 起止日期（或数据最小/最大日）渲染月历网格，
// 有花费的日期按金额深浅高亮，并显示当天花费。点击某天 → 筛选主列表到那天。

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

function compactYuan(cents: number) {
  const yuan = cents / 100;
  if (yuan >= 10000) return (yuan / 10000).toFixed(1) + '万';
  if (yuan >= 1000) return (yuan / 1000).toFixed(1) + 'k';
  return String(Math.round(yuan));
}

export default function TripCalendar({
  daily,
  startDate,
  endDate,
  baseCurrency,
  activeDate,
  onPickDay,
}: {
  daily: DailyPoint[];
  startDate: string | null;
  endDate: string | null;
  baseCurrency: string;
  activeDate: string | null;
  onPickDay: (date: string) => void;
}) {
  const { months, maxCents, hasData } = useMemo(() => {
    const max = daily.reduce((m, d) => Math.max(m, d.cents), 0);

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

    const months: { y: number; m: number; cells: (string | null)[] }[] = [];
    if (from && to) {
      const cur = new Date(from + 'T00:00:00');
      const last = new Date(to + 'T00:00:00');
      cur.setDate(1); // 从起始月的 1 号开始
      while (cur <= last) {
        const y = cur.getFullYear();
        const m = cur.getMonth();
        const first = new Date(y, m, 1);
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const lead = (first.getDay() + 6) % 7; // 周一为一周起点
        const cells: (string | null)[] = [];
        for (let i = 0; i < lead; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) {
          cells.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        }
        months.push({ y, m, cells });
        cur.setMonth(m + 1, 1);
      }
    }
    return { months, maxCents: max, hasData: daily.length > 0 };
  }, [daily, startDate, endDate]);

  if (!hasData) {
    return <div className="text-center text-xs text-ink-400 py-6">还没有花费记录</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="text-xs text-ink-500">行程日历（{baseCurrency}）</div>
        <div className="text-[10px] text-ink-400">点有记录的日期可筛选列表</div>
      </div>
      {months.map((mo) => (
        <div key={`${mo.y}-${mo.m}`}>
          <div className="text-xs text-ink-500 mb-1.5">
            {mo.y} 年 {mo.m + 1} 月
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEK.map((w) => (
              <div key={w} className="text-[10px] text-ink-400 py-0.5">
                {w}
              </div>
            ))}
            {mo.cells.map((date, i) => {
              if (!date) return <div key={`e${i}`} />;
              const cents = daily.find((d) => d.date === date)?.cents ?? 0;
              const ratio = maxCents > 0 ? cents / maxCents : 0;
              const isActive = activeDate === date;
              return (
                <button
                  key={date}
                  onClick={() => cents > 0 && onPickDay(date)}
                  disabled={cents === 0}
                  title={
                    cents > 0
                      ? `${date}：${(cents / 100).toLocaleString('zh-CN')} ${baseCurrency}`
                      : date
                  }
                  className={`relative rounded-lg py-1 flex flex-col items-center justify-center text-[11px] transition ${
                    isActive ? 'ring-2 ring-emerald-500' : ''
                  } ${cents > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                  style={{
                    background:
                      cents > 0
                        ? `rgba(16,185,129,${(0.12 + 0.55 * ratio).toFixed(3)})`
                        : 'transparent',
                    color: cents > 0 ? '#065f46' : '#9ca3af',
                  }}
                >
                  <span className={cents > 0 ? 'font-medium' : ''}>{Number(date.slice(8, 10))}</span>
                  {cents > 0 && (
                    <span className="text-[9px] leading-none mt-0.5 opacity-80">
                      {compactYuan(cents)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
