import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import Money from '@/components/ui/Money';
import Prefetcher from '@/components/ui/Prefetcher';
import { NOT_DELETED } from '@/lib/softDelete';
import { resolveOwnLedgerId } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

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

export default async function WorkPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  // Phase 2：/work 显示"我 owner 的那本工作账本"里的所有 Entry —— 与老行为一致
  // （创建者过滤已被 ledgerId 过滤替代；一个 ledger 可以有多人写入的条目）。
  // 共享的 work 账本走 /l/[id]（详情列表），/work 不聚合别人的 work。
  const workLedgerId = await resolveOwnLedgerId(user.id, 'work');
  const entries = await prisma.entry.findMany({
    where: { ledgerId: workLedgerId, ...NOT_DELETED },
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
      <Prefetcher routes={['/', `/work/${currentMonth}`]} />
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">工作账本</h1>
      </div>

      <div className="space-y-3">
        {months.map((m) => {
          const s = byMonth.get(m) ?? { income: 0, expense: 0, count: 0 };
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
