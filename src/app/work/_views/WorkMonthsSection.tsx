import Link from 'next/link';
import { prisma } from '@/lib/db';
import { NOT_DELETED } from '@/lib/softDelete';
import Money from '@/components/ui/Money';

// 工作账本"月份列表"section。
//
// 抽这一层的原因：Phase 3 之后同一段 UI 要被两处渲染 ——
//   * /work            —— 请求方 owner 的 work 账本（默认视角）
//   * /l/[id]          —— 共享 work 账本（当 kind === 'work' 时）
// 服务端组件，直接访问数据库；分月聚合与月份区间生成都在本文件里，
// 与 /work 老 page.tsx 的口径一致。
//
// backHref：返回按钮跳转目标（/ 或 /l/[id]/...）
// monthHrefPrefix：单月页链接前缀，比如 '/work' 或 '/l/<id>/month'

function makeMonthList(earliest: string | null): string[] {
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;

  let startY = curY;
  let startM = curM - 11;
  if (earliest) {
    const [ey, em] = earliest.split('-').map(Number);
    if (ey < startY || (ey === startY && em < startM)) {
      startY = ey;
      startM = em;
    }
  }
  while (startM <= 0) {
    startM += 12;
    startY -= 1;
  }

  const months: string[] = [];
  let y = startY;
  let m = startM;
  while (y < curY || (y === curY && m <= curM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months.reverse();
}

export default async function WorkMonthsSection({
  ledgerId,
  ledgerName,
  backHref,
  monthHrefPrefix,
}: {
  ledgerId: string;
  ledgerName: string;
  backHref: string;
  monthHrefPrefix: string;
}) {
  const entries = await prisma.entry.findMany({
    where: { ledgerId, ...NOT_DELETED },
    select: { yearMonth: true, direction: true, amountCents: true },
  });

  const byMonth = new Map<string, { income: number; expense: number; count: number }>();
  let earliest: string | null = null;
  for (const e of entries) {
    if (!earliest || e.yearMonth < earliest) earliest = e.yearMonth;
    const acc = byMonth.get(e.yearMonth) ?? { income: 0, expense: 0, count: 0 };
    if (e.direction === 'income') acc.income += e.amountCents;
    else acc.expense += e.amountCents;
    acc.count += 1;
    byMonth.set(e.yearMonth, acc);
  }

  const months = makeMonthList(earliest);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div className="px-6 pt-14">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">{ledgerName}</h1>
      </div>

      <div className="space-y-3">
        {months.map((m) => {
          const s = byMonth.get(m) ?? { income: 0, expense: 0, count: 0 };
          const isCurrent = m === currentMonth;
          return (
            <Link
              key={m}
              href={`${monthHrefPrefix}/${m}`}
              className={`block p-5 rounded-3xl border transition active:scale-[0.98] ${
                isCurrent
                  ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 border-transparent shadow-lg'
                  : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs opacity-70">{m.split('-')[0]} 年</div>
                  <div className="text-3xl font-semibold mt-0.5">
                    {Number(m.split('-')[1])} 月
                  </div>
                </div>
                <div className="text-right">
                  <div className="num text-2xl font-medium">
                    <Money cents={s.income} />
                  </div>
                  <div className="text-xs opacity-70 mt-1">
                    {s.count > 0 ? `${s.count} 条` : '点击记账'}
                  </div>
                </div>
              </div>
              {s.count > 0 && (
                <div className="mt-3 flex gap-4 text-xs opacity-80 num">
                  <span>进 <Money cents={s.income} /></span>
                  <span>出 <Money cents={s.expense} /></span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
