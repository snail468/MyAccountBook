// 周期记账的落库层。排期计算（纯函数）在 lib/recurring.ts。
//
// 触发时机：用户打开首页时顺带跑一次（与回收站维护同一个位置）。
// **不引入定时任务** —— 个人应用没有常驻调度器，而且"用户没打开应用的那几天
// 账目自动多出来"也没有实际意义：用户看到的那一刻补齐就够了。
// 代价是长期不打开应用就不生成，所以 dueOccurrences 支持补跑多期。

import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { dueOccurrences, type RecurringSchedule } from '@/lib/recurring';

const log = createLogger('recurring');

export type MaterializeResult = {
  created: number;
  /** 因为超出补跑上限而被丢弃了较早期次的规则数 */
  truncatedRules: number;
};

/**
 * 把所有到期的规则落成真实记账。
 *
 * 只处理 autoCreate=true 的规则；autoCreate=false 的只在界面上提示，
 * 由用户自己确认后再记 —— 有些人不想让账自己长出来。
 *
 * 幂等靠 lastGeneratedAt：生成到哪一期就记到哪，重复调用不会重复生成。
 * 每条规则的「生成条目 + 更新 lastGeneratedAt」放在同一个事务里，
 * 中途崩溃不会出现"记了账但没更新水位"（那会导致下次重复生成）。
 */
export async function materializeDueRules(
  userId: string,
  now: Date = new Date(),
): Promise<MaterializeResult> {
  const rules = await prisma.recurringRule.findMany({
    where: { userId, active: true, autoCreate: true },
  });
  if (rules.length === 0) return { created: 0, truncatedRules: 0 };

  let created = 0;
  let truncatedRules = 0;

  for (const r of rules) {
    const schedule: RecurringSchedule = {
      frequency: r.frequency === 'weekly' ? 'weekly' : 'monthly',
      dayOfMonth: r.dayOfMonth ?? undefined,
      dayOfWeek: r.dayOfWeek ?? undefined,
      startDate: r.startDate,
      endDate: r.endDate,
    };

    const { dates, truncated } = dueOccurrences(schedule, r.lastGeneratedAt, now);
    if (truncated) truncatedRules += 1;
    if (dates.length === 0) continue;

    try {
      await prisma.$transaction(async (tx) => {
        if (r.target === 'work') {
          await tx.entry.createMany({
            data: dates.map((d) => ({
              userId,
              // 工作账本按 yearMonth 归集，要与 occurredAt 保持一致
              yearMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
              category: r.category,
              direction: r.direction,
              amountCents: r.amountCents,
              note: r.note,
              occurredAt: d,
            })),
          });
        } else if (r.target === 'general' && r.ledgerId) {
          await tx.generalEntry.createMany({
            data: dates.map((d) => ({
              ledgerId: r.ledgerId!,
              direction: r.direction,
              category: r.category,
              amountCents: r.amountCents,
              note: r.note,
              occurredAt: d,
            })),
          });
        } else {
          // 目标非法（比如 general 但 ledgerId 为空）—— 跳过并停用，
          // 否则每次打开首页都白跑一遍
          throw new Error(`规则 ${r.id} 的目标无效：target=${r.target} ledgerId=${r.ledgerId}`);
        }

        await tx.recurringRule.update({
          where: { id: r.id },
          data: { lastGeneratedAt: dates[dates.length - 1] },
        });
      });
      created += dates.length;
    } catch (err) {
      // 单条规则失败不能影响其它规则，更不能让首页打不开
      log.error('周期规则生成失败，已跳过', err, { ruleId: r.id, userId });
    }
  }

  if (created > 0) {
    log.info('周期记账已生成', { userId, created, truncatedRules });
  }
  return { created, truncatedRules };
}
