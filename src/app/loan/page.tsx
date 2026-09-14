import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { parsePrefs, getLoanBusinessName } from '@/lib/userPrefs';
import { currentBeijingYearMonth, getBeijingMonthRange } from '@/lib/datetime';
import Prefetcher from '@/components/ui/Prefetcher';
import LoanDashboard from './LoanDashboard';

export const dynamic = 'force-dynamic';

export default async function LoanPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const [orders, userRow] = await Promise.all([
    prisma.loanOrder.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        broker: { select: { id: true, name: true, company: true } },
        cardStaff: { select: { id: true, name: true, workNo: true } },
        _count: { select: { logs: true, attachments: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { preferences: true },
    }),
  ]);

  const prefs = parsePrefs(userRow?.preferences);
  const businessName = getLoanBusinessName(prefs);

  // 算当前北京时间月份快速指标
  const currentMonth = currentBeijingYearMonth();
  const { start: startOfMonth, end: endOfMonth } = getBeijingMonthRange(currentMonth);

  const loanedThisMonth = orders.filter((o) => {
    if (!o.loanDate) return false;
    const d = new Date(o.loanDate);
    return d >= startOfMonth && d < endOfMonth;
  });

  const createdThisMonth = orders.filter((o) => {
    const d = new Date(o.createdAt);
    return d >= startOfMonth && d < endOfMonth;
  });

  const totalLoanedCents = loanedThisMonth.reduce((s, o) => s + (o.actualAmountCents || 0), 0);
  const mortgageOrders = loanedThisMonth.filter((o) => o.loanType === 'mortgage');
  const mortgageLoanedCents = mortgageOrders.reduce((s, o) => s + (o.actualAmountCents || 0), 0);
  const mortgageRatio = totalLoanedCents > 0
    ? ((mortgageLoanedCents / totalLoanedCents) * 100).toFixed(1) + '%'
    : '0%';

  const pendingApprovalCount = orders.filter((o) => o.stage === 'approval').length;

  const serialized = orders.map((o) => ({
    id: o.id,
    orderNo: o.orderNo,
    loanType: o.loanType,
    stage: o.stage,
    status: o.status,
    borrowerName: o.borrowerName,
    phone: o.phone,
    propertyAddress: o.propertyAddress,
    demandAmountCents: o.demandAmountCents,
    actualAmountCents: o.actualAmountCents,
    initialDescription: o.initialDescription,
    brokerNameSnapshot: o.brokerNameSnapshot,
    cardStaffNameSnapshot: o.cardStaffNameSnapshot,
    cardStaffWorkNoSnapshot: o.cardStaffWorkNoSnapshot,
    createdAt: o.createdAt.toISOString(),
    broker: o.broker,
    cardStaff: o.cardStaff,
    _count: o._count,
  }));

  return (
    <div className="px-6 pt-14 pb-28">
      <Prefetcher routes={['/', '/loan/new', '/loan/brokers', '/loan/card-staff', '/loan/stats']} />
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-ink-500 text-sm">‹ 首页</Link>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <span>🏠</span>
            <span>{businessName}</span>
          </h1>
        </div>
      </div>

      <LoanDashboard
        orders={serialized}
        businessName={businessName}
        stats={{
          totalLoanedCents,
          mortgageRatio,
          newIntentionCount: createdThisMonth.length,
          pendingApprovalCount,
        }}
      />
    </div>
  );
}
