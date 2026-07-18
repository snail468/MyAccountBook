import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { getSession } from '@/lib/session';

const schema = z.object({
  username: z.string().trim().min(2).max(32),
  password: z.string().min(6).max(128),
});

export async function POST(req: Request) {
  if (process.env.DISABLE_REGISTRATION === 'true') {
    return NextResponse.json({ error: '注册已关闭' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '用户名或密码格式不合规' }, { status: 400 });
  }
  const { username, password } = parsed.data;

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { username, passwordHash: await hashPassword(password) },
  });

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  await session.save();

  return NextResponse.json({ ok: true, username: user.username });
}
