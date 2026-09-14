import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  const order = await prisma.loanOrder.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    include: {
      broker: true,
      cardStaff: true,
      logs: {
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      },
      attachments: {
        orderBy: [{ createdAt: 'desc' }],
      },
    },
  });

  if (!order) return notFound('业务单据不存在');

  return NextResponse.json({ ok: true, order });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  const existing = await prisma.loanOrder.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) return notFound('业务单据不存在');

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return badRequest('无效的请求体');
  }

  const updateData: any = {};

  // 基础字段更新
  const allowedFields = [
    'borrowerName',
    'phone',
    'idCard',
    'loanType',
    'stage',
    'status',
    'brokerId',
    'cardStaffId',
    'propertyAddress',
    'propertyArea',
    'propertyPriceCents',
    'downPaymentCents',
    'demandAmountCents',
    'demandTermMonths',
    'bankName',
    'approvedAmountCents',
    'approvedRate',
    'repaymentMethod',
    'actualAmountCents',
    'loanDate',
    'firstRepayDate',
    'monthlyPaymentCents',
    'dueDate',
    'serviceFeeCents',
    'brokerCommissionCents',
    'cardCommissionCents',
    'netIncomeCents',
    'initialDescription',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (['loanDate', 'firstRepayDate', 'dueDate'].includes(field)) {
        updateData[field] = body[field] ? new Date(body[field]) : null;
      } else {
        updateData[field] = body[field];
      }
    }
  }

  // 经纪人变更同步快照
  if (body.brokerId !== undefined && body.brokerId !== existing.brokerId) {
    if (body.brokerId) {
      const b = await prisma.broker.findFirst({
        where: { id: body.brokerId, userId: user.id },
      });
      updateData.brokerNameSnapshot = b ? b.name : null;
    } else {
      updateData.brokerNameSnapshot = null;
    }
  }

  // 卡部人员变更同步快照
  if (body.cardStaffId !== undefined && body.cardStaffId !== existing.cardStaffId) {
    if (body.cardStaffId) {
      const cs = await prisma.cardStaff.findFirst({
        where: { id: body.cardStaffId, userId: user.id },
      });
      if (cs) {
        updateData.cardStaffNameSnapshot = cs.name;
        updateData.cardStaffWorkNoSnapshot = cs.workNo;
      }
    } else {
      updateData.cardStaffNameSnapshot = null;
      updateData.cardStaffWorkNoSnapshot = null;
    }
  }

  // 自动核算净收益（如果提供了收入与支出）
  const serviceFee = updateData.serviceFeeCents ?? existing.serviceFeeCents ?? 0;
  const brokerComm = updateData.brokerCommissionCents ?? existing.brokerCommissionCents ?? 0;
  const cardComm = updateData.cardCommissionCents ?? existing.cardCommissionCents ?? 0;
  if (body.serviceFeeCents !== undefined || body.brokerCommissionCents !== undefined || body.cardCommissionCents !== undefined) {
    updateData.netIncomeCents = serviceFee - brokerComm - cardComm;
  }

  // 是否随推进生成日志流水
  if (body.logAction && body.logContent) {
    await prisma.loanOrderLog.create({
      data: {
        orderId: id,
        action: String(body.logAction).trim(),
        content: String(body.logContent).trim(),
      },
    });
  }

  const updated = await prisma.loanOrder.update({
    where: { id },
    data: updateData,
    include: {
      broker: true,
      cardStaff: true,
      logs: { orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }] },
    },
  });

  return NextResponse.json({ ok: true, order: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  const existing = await prisma.loanOrder.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) return notFound('业务单据不存在');

  await prisma.loanOrder.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
