import { prisma } from '@/lib/db';
import { parsePrefs } from '@/lib/userPrefs';

// 幂等：为每位现有用户，按其"已经使用过的账本"补建对应的 Ledger 元数据行
//   - 有过 Entry → 补 work
//   - 有过 Event → 补 taoyuan
//   - 两个都没有 → 也补 work + taoyuan（默认让新用户见到经典视图）
// 受邀注册的用户（preferences.skipDefaultLedgers=true）跳过默认账本，
// 仅保留受邀协同的那一本。
const doneUsers = new Set<string>();

export async function ensureLedgersForUser(userId: string): Promise<void> {
  if (doneUsers.has(userId)) return;

  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  const skipDefault = parsePrefs(userRow?.preferences ?? null).skipDefaultLedgers === true;

  // 用户作为 owner（老数据 userId 字段）或 member（B7 协作，任何角色）参与的
  // work/taoyuan 账本。协同 member 也必须计入 —— 否则「在协同账本记了 Entry 但
  // 自己没建 work 账本」的用户会被误判为「用过 work」，凭空补建一本 own work，
  // 导致客户端出现两份。[#重复]
  const existing = await prisma.ledger.findMany({
    where: {
      kind: { in: ['work', 'taoyuan'] },
      OR: [{ userId }, { members: { some: { userId } } }],
    },
    select: { kind: true, id: true, userId: true },
  });
  const has = new Set(existing.map((l) => l.kind));

  // 清理历史 bug 产物：用户是协同 work/taoyuan 的 member、却残留一本「自动创建的
  // 空 own work/taoyuan」。硬删空的 own 账本，让客户端只看到协同那一本。[#重复]
  await purgeEmptyOwnLedger(
    existing.filter((l) => l.kind === 'work' && l.userId === userId),
    existing.filter((l) => l.kind === 'work' && l.userId !== userId),
    'work',
  );
  await purgeEmptyOwnLedger(
    existing.filter((l) => l.kind === 'taoyuan' && l.userId === userId),
    existing.filter((l) => l.kind === 'taoyuan' && l.userId !== userId),
    'taoyuan',
  );

  const toCreate: { kind: string; name: string; icon: string; order: number }[] = [];

  if (skipDefault) {
    // 受邀用户：不自动建工作 / 桃源账本，仅保留被邀请协同的账本。
  } else {
    const [entryCount, eventCount] = await Promise.all([
      prisma.entry.count({ where: { userId } }),
      prisma.event.count({ where: { userId } }),
    ]);

    const shouldWork = entryCount > 0 || (entryCount === 0 && eventCount === 0);
    const shouldTaoyuan = eventCount > 0 || (entryCount === 0 && eventCount === 0);

    if (shouldWork && !has.has('work')) {
      toCreate.push({ kind: 'work', name: '工作账本', icon: '💼', order: 0 });
    }
    if (shouldTaoyuan && !has.has('taoyuan')) {
      toCreate.push({ kind: 'taoyuan', name: '桃源账本', icon: '🌸', order: 1 });
    }
  }

  if (toCreate.length > 0) {
    // createMany 一次落下所有内置账本 —— 拿不到 id，不能顺便串 LedgerMember。
    // 分两步：先建 Ledger，再对新建这批 upsert owner 行。upsert 而不是 create
    // 是为了幂等 —— 万一同一账本已有 owner 行（旧版本用 create+ create 半途报错
    // 留下的残次品）也不会重复报 UNIQUE。
    await prisma.ledger.createMany({
      data: toCreate.map((t) => ({ ...t, userId })),
    });
    const created = await prisma.ledger.findMany({
      where: { userId, kind: { in: toCreate.map((t) => t.kind) } },
      select: { id: true },
    });
    for (const { id } of created) {
      await prisma.ledgerMember.upsert({
        where: { ledgerId_userId: { ledgerId: id, userId } },
        create: { ledgerId: id, userId, role: 'owner' },
        update: {},
      });
    }
  }

  doneUsers.add(userId);
}

type LedgerRow = { kind: string; id: string; userId: string };

/**
 * 清理历史 bug 产物：用户既是协同 work/taoyuan 的 member、又残留一本「自动创建
 * 的空 own work/taoyuan」。只硬删**空**的 own 账本（有 Entry/Event 的保留，
 * 可能是用户自己记过账的），让客户端只看到协同那一本。[#重复]
 */
async function purgeEmptyOwnLedger(
  own: LedgerRow[],
  shared: LedgerRow[],
  kind: 'work' | 'taoyuan',
): Promise<void> {
  if (shared.length === 0 || own.length === 0) return;
  for (const l of own) {
    const n =
      kind === 'work'
        ? await prisma.entry.count({ where: { ledgerId: l.id } })
        : await prisma.event.count({ where: { ledgerId: l.id } });
    if (n === 0) {
      await prisma.ledgerMember.deleteMany({ where: { ledgerId: l.id } });
      await prisma.ledger.delete({ where: { id: l.id } });
    }
  }
}
