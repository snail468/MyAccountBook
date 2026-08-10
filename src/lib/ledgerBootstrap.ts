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

  const existing = await prisma.ledger.findMany({
    where: { userId, kind: { in: ['work', 'taoyuan'] } },
    select: { kind: true },
  });
  const has = new Set(existing.map((l) => l.kind));

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
