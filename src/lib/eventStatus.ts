import { prisma } from '@/lib/db';

// 根据 EventAmount 里存在的 stage 派生 event.status；仅在没有任何 EventAmount 时，回退到旧 X_Cents 列
// 只考虑**未软删**的金额行 —— 用户删掉最后一笔"到账"金额时，status 应回退到 announced，
// 否则活动会永远停在"paid"，看起来永远没退路
export async function syncEventStatus(eventId: string) {
  const [amounts, ev] = await Promise.all([
    prisma.eventAmount.findMany({
      where: { eventId, deletedAt: null },
      select: { stage: true },
    }),
    prisma.event.findUnique({
      where: { id: eventId },
      select: { predictedCents: true, announcedCents: true, paidCents: true },
    }),
  ]);
  if (!ev) return;

  const stages = new Set(amounts.map((a) => a.stage));
  const hasPaid = stages.has('paid') || ev.paidCents !== null;
  const hasAnnounced = stages.has('announced') || ev.announcedCents !== null;
  const hasPredicted = stages.has('predicted') || ev.predictedCents !== null;

  const nextStatus = hasPaid
    ? 'paid'
    : hasAnnounced
      ? 'announced'
      : hasPredicted
        ? 'predicted'
        : 'published';

  await prisma.event.update({ where: { id: eventId }, data: { status: nextStatus } });
}
