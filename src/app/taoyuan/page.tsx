import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import NewEventButton from './NewEventButton';
import EventCard from './EventCard';

export const dynamic = 'force-dynamic';

const STATUS_ORDER = ['published', 'predicted', 'announced', 'paid'] as const;

export default async function TaoyuanPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const events = await prisma.event.findMany({
    where: { userId: user.id },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  const grouped = new Map<string, typeof events>();
  for (const s of STATUS_ORDER) grouped.set(s, []);
  for (const e of events) {
    grouped.get(e.status)?.push(e);
  }

  const labels: Record<string, string> = {
    published: '待预测',
    predicted: '待公示',
    announced: '待发钱',
    paid: '已到账',
  };

  return (
    <div className="px-6 pt-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">桃源账本</h1>
      </div>

      <NewEventButton />

      <div className="mt-6 space-y-6">
        {STATUS_ORDER.map((s) => {
          const list = grouped.get(s) ?? [];
          if (list.length === 0 && s === 'paid') return null;
          return (
            <section key={s}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="text-xs uppercase tracking-wide text-ink-500">{labels[s]}</div>
                <div className="text-xs text-ink-400">· {list.length}</div>
              </div>
              {list.length === 0 ? (
                <div className="text-xs text-ink-400 px-1 py-3">暂无</div>
              ) : (
                <div className="space-y-2">
                  {list.map((e) => (
                    <EventCard
                      key={e.id}
                      id={e.id}
                      title={e.title}
                      status={e.status}
                      participate={e.participate}
                      deadline={e.deadline ? e.deadline.toISOString() : null}
                      predictedCents={e.predictedCents}
                      announcedCents={e.announcedCents}
                      paidCents={e.paidCents}
                      note={e.note}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
