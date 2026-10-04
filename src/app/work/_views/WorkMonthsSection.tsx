import { prisma } from '@/lib/db';
import { NOT_DELETED } from '@/lib/softDelete';
import { currentBeijingYearMonth, getBeijingParts } from '@/lib/datetime';
import WorkMonthsClient from './WorkMonthsClient';

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
  const p = getBeijingParts(new Date())!;
  const curY = p.year;
  const curM = p.month;

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
  expensesHref,
}: {
  ledgerId: string;
  ledgerName: string;
  backHref: string;
  monthHrefPrefix: string;
  expensesHref: string;
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
  const currentMonth = currentBeijingYearMonth();

  const monthItems = months.map((m) => {
    const s = byMonth.get(m) ?? { income: 0, expense: 0, count: 0 };
    return {
      month: m,
      isCurrent: m === currentMonth,
      income: s.income,
      expense: s.expense,
      count: s.count,
    };
  });

  return (
    <WorkMonthsClient
      ledgerId={ledgerId}
      ledgerName={ledgerName}
      backHref={backHref}
      monthHrefPrefix={monthHrefPrefix}
      expensesHref={expensesHref}
      months={monthItems}
    />
  );
}
