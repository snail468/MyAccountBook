import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { getBeijingParts } from '@/lib/datetime';

const createOrderSchema = z.object({
  borrowerName: z.string().trim().min(1, '客户姓名必填').max(50),
  phone: z.string().trim().max(30).nullable().optional(),
  idCard: z.string().trim().max(30).nullable().optional(),
  loanType: z.string().trim().default('mortgage'),
  status: z.string().trim().default('intention'), // draft 或 intention
  
  // 人员关联
  brokerId: z.string().trim().nullable().optional(),
  cardStaffId: z.string().trim().nullable().optional(),
  
  // 房产要素（房按揭首位）
  propertyAddress: z.string().trim().max(200).nullable().optional(),
  propertyArea: z.number().nullable().optional(),
  propertyPriceCents: z.number().int().nullable().optional(),
  downPaymentCents: z.number().int().nullable().optional(),
  
  // 需求要素
  demandAmountCents: z.number().int().nullable().optional(),
  demandTermMonths: z.number().int().nullable().optional(),
  
  // 静态全景初始描述
  initialDescription: z.string().trim().max(5000).nullable().optional(),
});

function generateOrderNo(): string {
  const p = getBeijingParts(new Date())!;
  const y = p.year;
  const m = String(p.month).padStart(2, '0');
  const day = String(p.day).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `LO${y}${m}${day}${rand}`;
}

export async function GET(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const url = new URL(req.url);
  const stage = url.searchParams.get('stage') || 'all';
  const loanType = url.searchParams.get('loanType') || 'all';
  const brokerId = url.searchParams.get('brokerId');
  const cardStaffId = url.searchParams.get('cardStaffId');
  const q = url.searchParams.get('q')?.trim();

  const where: any = {
    userId: user.id,
    deletedAt: null,
  };

  if (stage !== 'all') {
    where.stage = stage;
  }
  if (loanType !== 'all') {
    where.loanType = loanType;
  }
  if (brokerId) {
    where.brokerId = brokerId;
  }
  if (cardStaffId) {
    where.cardStaffId = cardStaffId;
  }
  if (q) {
    where.OR = [
      { borrowerName: { contains: q } },
      { phone: { contains: q } },
      { orderNo: { contains: q } },
      { propertyAddress: { contains: q } },
    ];
  }

  const list = await prisma.loanOrder.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    include: {
      broker: { select: { id: true, name: true, company: true } },
      cardStaff: { select: { id: true, name: true, workNo: true } },
      _count: { select: { logs: true, attachments: true } },
    },
  });

  return NextResponse.json({ ok: true, list });
}

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const body = await req.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.errors[0]?.message || '参数校验失败');
  }

  const data = parsed.data;
  let brokerNameSnapshot: string | null = null;
  if (data.brokerId) {
    const b = await prisma.broker.findFirst({
      where: { id: data.brokerId, userId: user.id },
    });
    if (b) brokerNameSnapshot = b.name;
  }

  let cardStaffNameSnapshot: string | null = null;
  let cardStaffWorkNoSnapshot: string | null = null;
  if (data.cardStaffId) {
    const cs = await prisma.cardStaff.findFirst({
      where: { id: data.cardStaffId, userId: user.id },
    });
    if (cs) {
      cardStaffNameSnapshot = cs.name;
      cardStaffWorkNoSnapshot = cs.workNo;
    }
  }

  const orderNo = generateOrderNo();
  const stage = data.status === 'draft' ? 'draft' : 'intention';

  const order = await prisma.loanOrder.create({
    data: {
      userId: user.id,
      orderNo,
      loanType: data.loanType,
      stage,
      status: data.status,
      borrowerName: data.borrowerName,
      phone: data.phone || null,
      idCard: data.idCard || null,
      brokerId: data.brokerId || null,
      brokerNameSnapshot,
      cardStaffId: data.cardStaffId || null,
      cardStaffNameSnapshot,
      cardStaffWorkNoSnapshot,
      propertyAddress: data.propertyAddress || null,
      propertyArea: data.propertyArea || null,
      propertyPriceCents: data.propertyPriceCents || null,
      downPaymentCents: data.downPaymentCents || null,
      demandAmountCents: data.demandAmountCents || null,
      demandTermMonths: data.demandTermMonths || null,
      initialDescription: data.initialDescription || null,
      logs: {
        create: {
          action: data.status === 'draft' ? '保存草稿' : '新建意向单',
          content: data.status === 'draft'
            ? '个贷经理保存意向草稿'
            : `新建客户意向，申请业务：${data.loanType === 'mortgage' ? '房按揭' : data.loanType}，资金需求：${data.demandAmountCents ? (data.demandAmountCents / 1000000).toFixed(2) + '万元' : '待定'}`,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, order });
}
