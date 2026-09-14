import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { currentBeijingYearMonth, getBeijingMonthRange } from '@/lib/datetime';

export async function GET(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const url = new URL(req.url);
  const month = url.searchParams.get('month'); // YYYY-MM
  const currentMonth = month || currentBeijingYearMonth();
  const { start: startOfMonth, end: endOfMonth } = getBeijingMonthRange(currentMonth);

  // 查询本月创建的单据或本月放款的单据
  const allOrders = await prisma.loanOrder.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
    },
    include: {
      broker: true,
      cardStaff: true,
    },
  });

  // 1. 本月放款单据（按 loanDate 属于当前月份）
  const loanedThisMonth = allOrders.filter((o) => {
    if (!o.loanDate) return false;
    const d = new Date(o.loanDate);
    return d >= startOfMonth && d < endOfMonth;
  });

  // 2. 本月新建进件单据（按 createdAt 属于当前月份）
  const createdThisMonth = allOrders.filter((o) => {
    const d = new Date(o.createdAt);
    return d >= startOfMonth && d < endOfMonth;
  });

  const totalLoanedCents = loanedThisMonth.reduce((s, o) => s + (o.actualAmountCents || 0), 0);
  const mortgageOrders = loanedThisMonth.filter((o) => o.loanType === 'mortgage');
  const mortgageLoanedCents = mortgageOrders.reduce((s, o) => s + (o.actualAmountCents || 0), 0);

  const totalServiceFeeCents = loanedThisMonth.reduce((s, o) => s + (o.serviceFeeCents || 0), 0);
  const totalBrokerCommissionCents = loanedThisMonth.reduce((s, o) => s + (o.brokerCommissionCents || 0), 0);
  const totalCardCommissionCents = loanedThisMonth.reduce((s, o) => s + (o.cardCommissionCents || 0), 0);
  const totalNetIncomeCents = loanedThisMonth.reduce((s, o) => s + (o.netIncomeCents || 0), 0);

  // 3. 经纪人月度返佣明细聚合
  const brokerMap = new Map<string, {
    brokerId: string;
    brokerName: string;
    company: string | null;
    rateNote: string | null;
    accountInfo: string | null;
    count: number;
    totalAmountCents: number;
    totalCommissionCents: number;
    orders: Array<{ id: string; orderNo: string; borrowerName: string; amountCents: number | null; commissionCents: number | null }>;
  }>();

  // 4. 卡部工号协同业绩聚合
  const cardStaffMap = new Map<string, {
    cardStaffId: string;
    cardStaffName: string;
    workNo: string;
    branch: string | null;
    count: number;
    totalAmountCents: number;
    totalCommissionCents: number;
    orders: Array<{ id: string; orderNo: string; borrowerName: string; amountCents: number | null; commissionCents: number | null }>;
  }>();

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

  // 待办指标
  const pendingIntentionCount = allOrders.filter((o) => o.stage === 'intention').length;
  const pendingSchemeCount = allOrders.filter((o) => o.stage === 'scheme').length;
  const pendingApprovalCount = allOrders.filter((o) => o.stage === 'approval').length;
  const overdueCount = allOrders.filter((o) => o.stage === 'overdue' || o.status === 'overdue').length;

  return NextResponse.json({
    ok: true,
    month: currentMonth,
    summary: {
      newIntentionCount: createdThisMonth.length,
      loanedCount: loanedThisMonth.length,
      totalLoanedCents,
      mortgageLoanedCents,
      mortgageCount: mortgageOrders.length,
      mortgageRatio: totalLoanedCents > 0 ? ((mortgageLoanedCents / totalLoanedCents) * 100).toFixed(1) + '%' : '0%',
      totalServiceFeeCents,
      totalBrokerCommissionCents,
      totalCardCommissionCents,
      totalNetIncomeCents,
      pendingIntentionCount,
      pendingSchemeCount,
      pendingApprovalCount,
      overdueCount,
    },
    brokerStats: Array.from(brokerMap.values()),
    cardStaffStats: Array.from(cardStaffMap.values()),
  });
}
