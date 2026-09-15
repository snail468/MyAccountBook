import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireSessionUser, resolveOwnLedgerId } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';
import { formatYearMonthBeijing } from '@/lib/datetime';

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

  // 自动核算个人净收益（个人提成为收入）
  const serviceFee = updateData.serviceFeeCents ?? existing.serviceFeeCents ?? 0;
  if (body.netIncomeCents !== undefined) {
    updateData.netIncomeCents = body.netIncomeCents;
  } else if (body.serviceFeeCents !== undefined) {
    updateData.netIncomeCents = serviceFee;
  }

  // 是否随推进生成日志流水
  if (body.logAction && body.logContent) {
    const logOccurredAt = updateData.loanDate ?? new Date();
    await prisma.loanOrderLog.create({
      data: {
        orderId: id,
        action: String(body.logAction).trim(),
        content: String(body.logContent).trim(),
        occurredAt: logOccurredAt,
      },
    });
  }

  // 联动工作账本：确认放款且勾选记录工作账本垫款
  if (
    Boolean(body.recordWorkExpense) &&
    (updateData.stage === 'lending' || updateData.status === 'loaned' || body.stage === 'lending')
  ) {
    const brokerCommission = updateData.brokerCommissionCents ?? existing.brokerCommissionCents ?? 0;
    if (brokerCommission > 0) {
      try {
        const workLedgerId = await resolveOwnLedgerId(user.id, 'work');
        // 工作账本垫款同步的操作时间与放款成功登记时间严格一致（精确到分钟）
        const loanDateVal = updateData.loanDate ?? existing.loanDate ?? new Date();
        const d = new Date(loanDateVal);
        const ym = formatYearMonthBeijing(d);

        const borrowerText = existing.borrowerName + (existing.phone ? `(${existing.phone})` : '');
        const brokerText =
          updateData.brokerNameSnapshot ||
          existing.brokerNameSnapshot ||
          (existing.brokerId ? (await prisma.broker.findUnique({ where: { id: existing.brokerId } }))?.name : null) ||
          '未指定经纪人';
        const actualAmountCents = updateData.actualAmountCents ?? existing.actualAmountCents ?? 0;
        const loanAmountWan = (actualAmountCents / 1000000).toFixed(2);
        // 垫款备注：借款人信息、经纪人信息、放款金额
        const note = `借款人: ${borrowerText}，经纪人: ${brokerText}，放款金额: ${loanAmountWan}万元`;

        await prisma.entry.create({
          data: {
            userId: user.id,
            ledgerId: workLedgerId,
            yearMonth: ym,
            category: '房贷垫款',
            direction: 'expense',
            amountCents: brokerCommission,
            note,
            occurredAt: d,
          },
        });

        await prisma.loanOrderLog.create({
          data: {
            orderId: id,
            action: '工作账本垫款同步',
            content: `已同步在工作账本记一笔出项【房贷垫款】¥${(brokerCommission / 100).toFixed(2)}，备注：${note}`,
            occurredAt: d,
          },
        });
      } catch (e) {
        console.error('Failed to sync work ledger expense:', e);
      }
    }
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

  revalidatePath('/loan');
  revalidatePath(`/loan/${id}`);
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

  revalidatePath('/loan');
  revalidatePath(`/loan/${id}`);
  return NextResponse.json({ ok: true });
}
