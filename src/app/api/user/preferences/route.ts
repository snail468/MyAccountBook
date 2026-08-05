import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { mergePrefs, parsePrefs, stringifyPrefs } from '@/lib/userPrefs';

// PATCH 语义：合并到现有 preferences，不是替换。
// 客户端只需传自己关心的字段 —— 未传的其它偏好原样保留。
//
// 目前只有 incomeComponents 一个字段。以后加别的偏好，扩这个 schema
// + userPrefs.mergePrefs 内加对应分支就行，不用新 endpoint。

const bodySchema = z.object({
  incomeComponents: z.record(z.string().min(1).max(200), z.boolean()).optional(),
});

export async function PATCH(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest();

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { preferences: true },
  });
  const current = parsePrefs(row?.preferences ?? null);
  const next = mergePrefs(current, parsed.data);

  await prisma.user.update({
    where: { id: user.id },
    data: { preferences: stringifyPrefs(next) },
  });

  return NextResponse.json({ ok: true, preferences: next });
}
