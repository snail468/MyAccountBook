import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { requireUserWithRole } from '@/lib/session';
import { assessPassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

const patchSchema = z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128).optional(),
  role: z.enum(['admin', 'user']).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const current = await requireUserWithRole();
  if (!current || current.role !== 'admin') {
    return NextResponse.json({ error: '仅管理员可操作' }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const p = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, username: true },
  });
  if (!target) return NextResponse.json({ error: '不存在' }, { status: 404 });

  if (p.password) {
    const assessment = assessPassword(p.password, target.username);
    if (!assessment.acceptable) {
      return NextResponse.json({ error: assessment.reason }, { status: 400 });
    }
  }

  // 不允许自我降级为 user（避免锁死自己）
  if (target.id === current.id && p.role === 'user') {
    return NextResponse.json({ error: '不能把自己降级' }, { status: 400 });
  }
  // 不允许把最后一个 admin 降级
  if (p.role === 'user' && target.role === 'admin') {
    const adminCount = await prisma.user.count({ where: { role: 'admin' } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: '至少要保留一个管理员' }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = {};
  if (p.password) {
    data.passwordHash = await hashPassword(p.password);
    // 管理员重置密码 = 强制下线：把该用户所有已签发的会话作废，
    // 并解掉可能存在的登录锁（重置的常见场景就是用户把自己锁住了）
    data.sessionVersion = { increment: 1 };
    data.failedLoginCount = 0;
    data.lockedUntil = null;
  }
  if (p.role) data.role = p.role;

  await prisma.user.update({ where: { id }, data });
  return NextResponse.json({ ok: true, sessionsRevoked: !!p.password });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const current = await requireUserWithRole();
  if (!current || current.role !== 'admin') {
    return NextResponse.json({ error: '仅管理员可操作' }, { status: 403 });
  }
  const { id } = await params;
  if (id === current.id) {
    return NextResponse.json({ error: '不能删除自己' }, { status: 400 });
  }
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!target) return NextResponse.json({ error: '不存在' }, { status: 404 });

  if (target.role === 'admin') {
    const adminCount = await prisma.user.count({ where: { role: 'admin' } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: '至少要保留一个管理员' }, { status: 400 });
    }
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
