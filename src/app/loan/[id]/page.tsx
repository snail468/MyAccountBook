import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import OrderDetail from './OrderDetail';

export const dynamic = 'force-dynamic';

export default async function LoanOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/login');

  const { id } = await params;

  const [order, brokers, cardStaffs] = await Promise.all([
    prisma.loanOrder.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      include: {
        broker: true,
        cardStaff: true,
        logs: {
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        },
      },
    }),
    prisma.broker.findMany({
      where: { userId: user.id, deletedAt: null },
      select: { id: true, name: true, company: true },
    }),
    prisma.cardStaff.findMany({
      where: { userId: user.id, deletedAt: null },
      select: { id: true, name: true, workNo: true },
    }),
  ]);

  if (!order) notFound();

  const serialized = {
    id: order.id,
    orderNo: order.orderNo,
    loanType: order.loanType,
    stage: order.stage,
    status: order.status,
    borrowerName: order.borrowerName,
    phone: order.phone,
    idCard: order.idCard,
    brokerId: order.brokerId,
    brokerNameSnapshot: order.brokerNameSnapshot,
    cardStaffId: order.cardStaffId,
    cardStaffNameSnapshot: order.cardStaffNameSnapshot,
    cardStaffWorkNoSnapshot: order.cardStaffWorkNoSnapshot,
    propertyAddress: order.propertyAddress,
    propertyArea: order.propertyArea,
    propertyPriceCents: order.propertyPriceCents,
    downPaymentCents: order.downPaymentCents,
    demandAmountCents: order.demandAmountCents,
    demandTermMonths: order.demandTermMonths,
    bankName: order.bankName,
    approvedAmountCents: order.approvedAmountCents,
    approvedRate: order.approvedRate,
    repaymentMethod: order.repaymentMethod,
    actualAmountCents: order.actualAmountCents,
    loanDate: order.loanDate ? order.loanDate.toISOString() : null,
    firstRepayDate: order.firstRepayDate ? order.firstRepayDate.toISOString() : null,
    monthlyPaymentCents: order.monthlyPaymentCents,
    dueDate: order.dueDate ? order.dueDate.toISOString() : null,
    serviceFeeCents: order.serviceFeeCents,
    brokerCommissionCents: order.brokerCommissionCents,
    cardCommissionCents: order.cardCommissionCents,
    netIncomeCents: order.netIncomeCents,
    initialDescription: order.initialDescription,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    broker: order.broker,
    cardStaff: order.cardStaff,
    logs: order.logs.map((l) => ({
      id: l.id,
      action: l.action,
      content: l.content,
      occurredAt: l.occurredAt.toISOString(),
    })),
  };

  return (
    <div className="px-6 pt-14 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/loan" className="text-ink-500 text-sm">‹ 返回业务台账</Link>
        <h1 className="text-2xl font-semibold flex-1">业务单据详情</h1>
      </div>

      <OrderDetail
        initialOrder={serialized}
        brokers={brokers}
        cardStaffs={cardStaffs}
      />
    </div>
  );
}
