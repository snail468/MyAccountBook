import { prisma } from '@/lib/db';

// 一次性把旧列 (predictedCents / announcedCents / paidCents) 迁到 EventAmount 表
// 每个 Node 进程启动后跑一次，幂等：只处理 EventAmount 尚无对应 stage 记录的事件
let done = false;
let running: Promise<void> | null = null;

export function ensureLegacyMigrated(): Promise<void> {
  if (done) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    try {
      const events = await prisma.event.findMany({
        where: {
          OR: [
            { predictedCents: { not: null } },
            { announcedCents: { not: null } },
            { paidCents: { not: null } },
          ],
        },
        include: { amounts: { select: { stage: true } } },
      });
      for (const ev of events) {
        const stages = new Set(ev.amounts.map((a) => a.stage));
        const inserts: { eventId: string; stage: string; cents: number; rewardMethod: string | null; occurredAt: Date }[] = [];
        const clearFields: Record<string, null> = {};

        if (ev.predictedCents !== null && !stages.has('predicted')) {
          inserts.push({
            eventId: ev.id,
            stage: 'predicted',
            cents: ev.predictedCents,
            rewardMethod: ev.rewardMethod ?? null,
            occurredAt: ev.predictedAt ?? new Date(),
          });
          clearFields.predictedCents = null;
          clearFields.predictedAt = null;
        }
        if (ev.announcedCents !== null && !stages.has('announced')) {
          inserts.push({
            eventId: ev.id,
            stage: 'announced',
            cents: ev.announcedCents,
            rewardMethod: ev.rewardMethod ?? null,
            occurredAt: ev.announcedAt ?? new Date(),
          });
          clearFields.announcedCents = null;
          clearFields.announcedAt = null;
        }
        if (ev.paidCents !== null && !stages.has('paid')) {
          inserts.push({
            eventId: ev.id,
            stage: 'paid',
            cents: ev.paidCents,
            rewardMethod: ev.rewardMethod ?? null,
            occurredAt: ev.paidAt ?? new Date(),
          });
          clearFields.paidCents = null;
          clearFields.paidAt = null;
        }

        if (inserts.length > 0) {
          await prisma.$transaction([
            prisma.eventAmount.createMany({ data: inserts }),
            prisma.event.update({ where: { id: ev.id }, data: clearFields }),
          ]);
        }
      }
      done = true;
    } catch (err) {
      console.error('[legacyMigrate] failed:', err);
      running = null; // 允许重试
      throw err;
    }
  })();
  return running;
}
