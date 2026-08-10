import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { issueSession, requireUserWithRole } from '@/lib/session';
import { assessPassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';
import { ensureUserSetup } from '@/lib/bootstrap';
import { stringifyPrefs } from '@/lib/userPrefs';
import { badRequest, conflict, forbidden } from '@/lib/apiError';

const schema = z.object({
  username: z.string().trim().min(2).max(32),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128),
  // 邀请码路径：未登录访客拿着 owner 生成的一次性邀请链接注册。
  // 后端只校验邀请存在、未过期、未使用；接受邀请仍走 /invite/[token] 页面。
  inviteToken: z.string().min(20).max(200).optional(),
});

// 公开注册开放的三种情况：
//   1) 数据库里 0 用户时（首次 bootstrap）
//   2) 已登录 admin 为别人开号（不签发新 session）
//   3) 带一份有效未使用的邀请码 —— 注册后自动签发 session，方便下一步接受邀请
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return badRequest(`用户名 2-32 字符，密码至少 ${PASSWORD_MIN_LENGTH} 字符`);
  }
  const { username, password, inviteToken } = parsed.data;

  const assessment = assessPassword(password, username);
  if (!assessment.acceptable) {
    return badRequest(assessment.reason);
  }

  const userCount = await prisma.user.count();
  const isBootstrap = userCount === 0;

  let creatorRole: 'admin' | 'user' | null = null;
  let viaInvite = false;

  if (!isBootstrap) {
    // 优先看邀请码路径；有则不再要求 admin 登录
    if (inviteToken) {
      const invite = await prisma.ledgerInvite.findUnique({
        where: { token: inviteToken },
        select: {
          acceptedByUserId: true,
          expiresAt: true,
          ledger: { select: { deletedAt: true, archived: true } },
        },
      });
      const expired = invite?.expiresAt && invite.expiresAt < new Date();
      const inactive = invite?.ledger.deletedAt || invite?.ledger.archived;
      if (!invite || invite.acceptedByUserId || expired || inactive) {
        return forbidden('邀请链接无效或已过期');
      }
      viaInvite = true;
    } else {
      const current = await requireUserWithRole();
      if (!current || current.role !== 'admin') {
        return forbidden('自助注册已关闭，请联系管理员开号');
      }
      creatorRole = current.role as 'admin' | 'user';
    }
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    return conflict('用户名已存在');
  }

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      // bootstrap 时首个用户自动 admin，其它一律普通用户
      role: isBootstrap ? 'admin' : 'user',
      // 受邀注册：标记跳过默认工作/桃源账本，只保留受邀协同的账本
      ...(viaInvite ? { preferences: stringifyPrefs({ skipDefaultLedgers: true }) } : {}),
    },
  });

  // bootstrap 与邀请码路径都会让新用户直接登录：
  // - bootstrap 是第一个用户，登录合情合理
  // - 邀请码路径下一步就要在 /invite/[token] 页点"接受"，需要已登录会话
  // admin 开号不签发 session，保留管理员自己的登录态
  if (isBootstrap || viaInvite) {
    await ensureUserSetup(user.id);
    await issueSession(user);
  }

  return NextResponse.json({
    ok: true,
    username: user.username,
    bootstrap: isBootstrap,
    viaInvite,
    createdBy: creatorRole,
  });
}
