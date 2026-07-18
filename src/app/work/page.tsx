import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { formatYuan } from '@/lib/money';

export const dynamic = 'force-dynamic';

// 生成从最早条目所在月份 到 当前月份 的月份列表 (倒序)
function makeMonthList(earliest: string | null): string[] {
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;

  // 至少覆盖过去 12 个月，或从 earliest 到 现在
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

export default async function WorkPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const entries = await prisma.entry.findMany({
    where: { userId: user.id },
    select: { yearMonth: true, direction: true, amountCents: true, reimbursable: true },
  });

  const byMonth = new Map<
    string,
    { income: number; expense: number; reimbursable: number; count: number }
  >();
  let earliest: string | null = null;
  for (const e of entries) {
    if (!earliest || e.yearMonth < earliest) earliest = e.yearMonth;
    const acc =
      byMonth.get(e.yearMonth) ?? { income: 0, expense: 0, reimbursable: 0, count: 0 };
    if (e.direction === 'income') {
      acc.income += e.amountCents;
    } else if (e.reimbursable) {
      acc.reimbursable += e.amountCents;
    } else {
      acc.expense += e.amountCents;
    }
    acc.count += 1;
    byMonth.set(e.yearMonth, acc);
  }

  const months = makeMonthList(earliest);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div className="px-6 pt-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">工作账本</h1>
      </div>

      <div className="space-y-3">
        {months.map((m) => {
          const s = byMonth.get(m) ?? { income: 0, expense: 0, reimbursable: 0, count: 0 };
          // 报销出项不计入月净额
          const net = s.income - s.expense;
          const isCurrent = m === currentMonth;
          return (
            <Link
              key={m}
              href={`/work/${m}`}
              className={`block p-5 rounded-3xl border transition active:scale-[0.98] ${
                isCurrent
                  ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 border-transparent shadow-lg'
                  : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs opacity-70">
                    {m.split('-')[0]} 年
                  </div>
                  <div className="text-3xl font-semibold mt-0.5">
                    {Number(m.split('-')[1])} 月
                  </div>
                </div>
                <div className="text-right">
                  <div className={`num text-2xl font-medium ${net < 0 ? 'text-red-400' : ''}`}>
                    {formatYuan(net, { sign: true })}
                  </div>
                  <div className="text-xs opacity-70 mt-1">
                    {s.count > 0 ? `${s.count} 条` : '点击记账'}
                  </div>
                </div>
              </div>
              {s.count > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-80 num">
                  <span>入 {formatYuan(s.income)}</span>
                  <span>出 {formatYuan(s.expense)}</span>
                  {s.reimbursable > 0 && <span>报销 {formatYuan(s.reimbursable)}</span>}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
