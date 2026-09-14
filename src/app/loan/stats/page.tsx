import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { currentBeijingYearMonth, getBeijingMonthRange } from '@/lib/datetime';
import LoanStatsView from './LoanStatsView';

export const dynamic = 'force-dynamic';

export default async function LoanStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/login');

  const { month } = await searchParams;
  const currentMonth = month || currentBeijingYearMonth();
  const { start: startOfMonth, end: endOfMonth } = getBeijingMonthRange(currentMonth);

  const allOrders = await prisma.loanOrder.findMany({
    where: { userId: user.id, deletedAt: null },
    include: { broker: true, cardStaff: true },
  });

  const loanedThisMonth = allOrders.filter((o) => {
    if (!o.loanDate) return false;
    const d = new Date(o.loanDate);
    return d >= startOfMonth && d < endOfMonth;
  });

  const createdThisMonth = allOrders.filter((o) => {
    const d = new Date(o.createdAt);
    return d >= startOfMonth && d < endOfMonth;
  });

  const totalLoanedCents = loanedThisMonth.reduce((s, o) => s + (o.actualAmountCents || 0), 0);
  const mortgageOrders = loanedThisMonth.filter((o) => o.loanType === 'mortgage');
  const mortgageLoanedCents = mortgageOrders.reduce((s, o) => s + (o.actualAmountCents || 0), 0);
  const mortgageRatio = totalLoanedCents > 0
    ? ((mortgageLoanedCents / totalLoanedCents) * 100).toFixed(1) + '%'
    : '0%';

  const totalServiceFeeCents = loanedThisMonth.reduce((s, o) => s + (o.serviceFeeCents || 0), 0);
  const totalBrokerCommissionCents = loanedThisMonth.reduce((s, o) => s + (o.brokerCommissionCents || 0), 0);
  const totalCardCommissionCents = loanedThisMonth.reduce((s, o) => s + (o.cardCommissionCents || 0), 0);
  const totalNetIncomeCents = loanedThisMonth.reduce((s, o) => s + (o.netIncomeCents || 0), 0);

  // 经纪人返佣聚合
  const brokerMap = new Map<string, any>();
  for (const o of loanedThisMonth) {
    if (o.brokerId || o.brokerNameSnapshot) {
      const key = o.brokerId || o.brokerNameSnapshot!;
      const item = brokerMap.get(key) || {
        brokerId: o.brokerId || '',
        brokerName: o.broker?.name || o.brokerNameSnapshot || '未知经纪人',
        company: o.broker?.company || null,
        rateNote: o.broker?.rateNote || null,
        accountInfo: o.broker?.accountInfo || null,
        count: 0,
        totalAmountCents: 0,
        totalCommissionCents: 0,
        orders: [],
      };
      item.count += 1;
      item.totalAmountCents += (o.actualAmountCents || 0);
      item.totalCommissionCents += (o.brokerCommissionCents || 0);
      item.orders.push({
        id: o.id,
        orderNo: o.orderNo,
        borrowerName: o.borrowerName,
        amountCents: o.actualAmountCents,
        commissionCents: o.brokerCommissionCents,
      });
      brokerMap.set(key, item);
    }
  }

  // 卡部工号协同聚合
  const cardStaffMap = new Map<string, any>();
  for (const o of loanedThisMonth) {
    if (o.cardStaffId || o.cardStaffWorkNoSnapshot) {
      const key = o.cardStaffWorkNoSnapshot || o.cardStaffId || 'unknown';
      const item = cardStaffMap.get(key) || {
        cardStaffId: o.cardStaffId || '',
        cardStaffName: o.cardStaff?.name || o.cardStaffNameSnapshot || '卡部人员',
        workNo: o.cardStaff?.workNo || o.cardStaffWorkNoSnapshot || '-',
        branch: o.cardStaff?.branch || null,
        count: 0,
        totalAmountCents: 0,
        totalCommissionCents: 0,
        orders: [],
      };
      item.count += 1;
      item.totalAmountCents += (o.actualAmountCents || 0);
      item.totalCommissionCents += (o.cardCommissionCents || 0);
      item.orders.push({
        id: o.id,
        orderNo: o.orderNo,
        borrowerName: o.borrowerName,
        amountCents: o.actualAmountCents,
        commissionCents: o.cardCommissionCents,
      });
      cardStaffMap.set(key, item);
    }
  }

  const initialData = {
    month: currentMonth,
    summary: {
      newIntentionCount: createdThisMonth.length,
      loanedCount: loanedThisMonth.length,
      totalLoanedCents,
      mortgageLoanedCents,
      mortgageCount: mortgageOrders.length,
      mortgageRatio,
      totalServiceFeeCents,
      totalBrokerCommissionCents,
      totalCardCommissionCents,
      totalNetIncomeCents,
    },
    brokerStats: Array.from(brokerMap.values()),
    cardStaffStats: Array.from(cardStaffMap.values()),
  };

  return (
    <div className="px-6 pt-14 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/loan" className="text-ink-500 text-sm">‹ 返回业务台账</Link>
        <h1 className="text-2xl font-semibold flex-1">月度业绩与提成对账</h1>
      </div>

      <LoanStatsView initialData={initialData} />
    </div>
  );
}
