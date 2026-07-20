import { prisma } from '@/lib/db';

// 幂等：为每位现有用户，按其"已经使用过的账本"补建对应的 Ledger 元数据行
//   - 有过 Entry → 补 work
//   - 有过 Event → 补 taoyuan
//   - 两个都没有 → 也补 work + taoyuan（默认让新用户见到经典视图）
const doneUsers = new Set<string>();

export async function ensureLedgersForUser(userId: string): Promise<void> {
  if (doneUsers.has(userId)) return;

  const existing = await prisma.ledger.findMany({
    where: { userId, kind: { in: ['work', 'taoyuan'] } },
    select: { kind: true },
  });
  const has = new Set(existing.map((l) => l.kind));

  const toCreate: { kind: string; name: string; icon: string; order: number }[] = [];

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

  if (toCreate.length > 0) {
    await prisma.ledger.createMany({
      data: toCreate.map((t) => ({ ...t, userId })),
    });
  }

  doneUsers.add(userId);
}
