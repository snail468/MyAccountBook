import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { isLedgerRole } from '@/lib/ledgerRole';
import CollaboratorsPanel from './CollaboratorsPanel';

export const dynamic = 'force-dynamic';

export default async function CollaboratorsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/login');
  const { id } = await params;

  const ledger = await prisma.ledger.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      kind: true,
      icon: true,
      members: {
        orderBy: { createdAt: 'asc' },
        select: {
          userId: true,
          role: true,
          createdAt: true,
          user: { select: { username: true } },
        },
      },
      invites: {
        where: { acceptedByUserId: null },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          token: true,
          role: true,
          createdAt: true,
          expiresAt: true,
        },
      },
    },
  });
  if (!ledger) notFound();

  const me = ledger.members.find((m) => m.userId === user.id);
  if (!me) notFound();
  const myRole = isLedgerRole(me.role) ? me.role : 'viewer';

  // 顶部导航链接：账本详情页
  const backHref =
    ledger.kind === 'work' ? '/work' : ledger.kind === 'taoyuan' ? '/taoyuan' : `/l/${ledger.id}`;

  return (
    <div className="px-6 pt-14 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-ink-500 text-sm">
          ‹ 返回
        </Link>
        <h1 className="text-2xl font-semibold flex-1">
          {ledger.icon ?? ''} {ledger.name} · 协作成员
        </h1>
      </div>

      <CollaboratorsPanel
        ledgerId={ledger.id}
        ledgerKind={ledger.kind}
        myRole={myRole}
        myUserId={user.id}
        initialMembers={ledger.members.map((m) => ({
          userId: m.userId,
          username: m.user.username,
          role: m.role,
          createdAt: m.createdAt.toISOString(),
        }))}
        initialInvites={
          myRole === 'owner'
            ? ledger.invites.map((v) => ({
                id: v.id,
                token: v.token,
                role: v.role,
                createdAt: v.createdAt.toISOString(),
                expiresAt: v.expiresAt?.toISOString() ?? null,
              }))
            : []
        }
      />
    </div>
  );
}
