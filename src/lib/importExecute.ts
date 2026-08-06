// 导入的落库层。纯计算部分在 lib/importData.ts，这里只负责把计划写进数据库。

import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import type { ImportMode, ImportPlan } from '@/lib/importData';

const log = createLogger('import');

/**
 * 查该用户当前有哪些**活跃的**内置账本 —— merge 模式据此避免建出第二个工作/桃源账本。
 * 回收站里的不算，那些本来就不该挡住导入。
 * B7 Phase 2 后 "我的账本" 走 LedgerMember(role='owner')。
 */
export async function existingBuiltinKinds(userId: string): Promise<Set<string>> {
  const rows = await prisma.ledger.findMany({
    where: {
      deletedAt: null,
      kind: { in: ['work', 'taoyuan'] },
      members: { some: { userId, role: 'owner' } },
    },
    select: { kind: true },
  });
  return new Set(rows.map((r) => r.kind));
}

/**
 * 执行导入。**整个过程在一个事务里** —— 中途任何一步失败都回滚，
 * 不会留下一个导入了一半的账本。replace 模式的删除也在同一个事务里，
 * 所以"删完了但没导进去"这种最坏情况不可能发生。
 *
 * 插入顺序按外键依赖：账本 → 成员 → 支出 → 分摊，活动 → 金额。
 */
export async function applyImport(
  userId: string,
  plan: ImportPlan,
  mode: ImportMode,
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      if (mode === 'replace') {
        // 顺序同样要照顾外键：先删子表再删父表。
        // Ledger 的级联会带走 GeneralEntry / TripMember / TripExpense / TripSplit / Entry / Event，
        // 但显式删一遍更好读，也不依赖 schema 里的 onDelete 配置不被改动。
        // Phase 2 后 Entry / Event 也 ledger-scoped，删除范围口径统一到 "我 owner 的账本"。
        const ownedLedger = { members: { some: { userId, role: 'owner' } } };
        await tx.tripSplit.deleteMany({ where: { expense: { ledger: ownedLedger } } });
        await tx.tripExpense.deleteMany({ where: { ledger: ownedLedger } });
        await tx.tripMember.deleteMany({ where: { ledger: ownedLedger } });
        await tx.generalEntry.deleteMany({ where: { ledger: ownedLedger } });
        await tx.eventAmount.deleteMany({ where: { event: { ledger: ownedLedger } } });
        // 先摘掉父子关系再删，避免自引用外键的删除顺序问题
        await tx.event.updateMany({ where: { ledger: ownedLedger }, data: { parentId: null } });
        await tx.event.deleteMany({ where: { ledger: ownedLedger } });
        await tx.entry.deleteMany({ where: { ledger: ownedLedger } });
        // Ledger 删除会级联带走 LedgerMember —— 那份"我 owner"的关系也一并没了，
        // 后续 plan.ledgers 里新建的账本会再插一批 owner 关系（见下方）。
        await tx.ledger.deleteMany({ where: ownedLedger });
      }

      if (plan.ledgers.length) {
        await tx.ledger.createMany({ data: plan.ledgers });
        // Phase 2：每张新导入的 Ledger 也要挂当前 user 为 owner —— 否则导入完
        // 用户自己都进不去自己的账本。用 raw INSERT 避免 createMany 不支持嵌套关系。
        for (const l of plan.ledgers) {
          await tx.ledgerMember.upsert({
            where: { ledgerId_userId: { ledgerId: l.id, userId } },
            create: { ledgerId: l.id, userId, role: 'owner' },
            update: {},
          });
        }
      }
      if (plan.entries.length) await tx.entry.createMany({ data: plan.entries });

      if (plan.events.length) {
        // 自引用：先插入时把 parentId 置空，全部落库后再补回去，
        // 否则子活动可能排在父活动前面，插入时父行还不存在
        await tx.event.createMany({
          data: plan.events.map((e) => ({ ...e, parentId: null })),
        });
        for (const e of plan.events) {
          if (e.parentId) {
            await tx.event.update({ where: { id: e.id }, data: { parentId: e.parentId } });
          }
        }
      }
      if (plan.eventAmounts.length) await tx.eventAmount.createMany({ data: plan.eventAmounts });
      if (plan.generalEntries.length)
        await tx.generalEntry.createMany({ data: plan.generalEntries });
      if (plan.tripMembers.length) await tx.tripMember.createMany({ data: plan.tripMembers });
      if (plan.tripExpenses.length) await tx.tripExpense.createMany({ data: plan.tripExpenses });
      if (plan.tripSplits.length) await tx.tripSplit.createMany({ data: plan.tripSplits });
    },
    {
      // 大备份的插入可能超过默认的 5 秒。这是用户显式触发的一次性操作，
      // 给足时间比让它半路超时回滚要好
      timeout: 120_000,
      maxWait: 10_000,
    },
  );

  log.info('导入完成', { userId, mode, ...plan.summary });
}
