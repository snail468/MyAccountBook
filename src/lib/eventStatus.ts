import { prisma } from '@/lib/db';

// 根据 EventAmount 里存在的 stage 派生 event.status；仅在没有任何 EventAmount 时，回退到旧 X_Cents 列
export async function syncEventStatus(eventId: string) {
  const [amounts, ev] = await Promise.all([
    prisma.eventAmount.findMany({
      where: { eventId },
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
