import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { formatYuan } from '@/lib/money';
import LogoutButton from '@/components/LogoutButton';
import ExportButton from '@/components/ExportButton';

export const dynamic = 'force-dynamic';

async function getSummary(userId: string) {
  const [entries, paidEvents, pendingCount] = await Promise.all([
    prisma.entry.findMany({
      where: { userId },
      select: { direction: true, amountCents: true },
    }),
    // paid 状态的活动。合并后子活动 parentId 有值 —— 但每笔到账都是唯一记录，
    // C/D 用「所有 paid 事件」直接聚合即可（子+父不会重复计到账，只有真正 pay 过的才会有 paidCents）
    prisma.event.findMany({
      where: { userId, status: 'paid' },
      select: { rewardMethod: true, paidCents: true },
    }),
    prisma.event.count({
      where: {
        userId,
        status: { in: ['published', 'predicted', 'announced'] },
      },
    }),
  ]);

  const B = entries
    .filter((e) => e.direction === 'income')
    .reduce((a, e) => a + e.amountCents, 0);

  const expenseTotal = entries
    .filter((e) => e.direction === 'expense')
    .reduce((a, e) => a + e.amountCents, 0);

  let C = 0;
  let D = 0;
  const otherReward = new Map<string, number>();
  for (const ev of paidEvents) {
    const c = ev.paidCents ?? 0;
    if (ev.rewardMethod === 'cash') C += c;
    else if (ev.rewardMethod === 'jdcard') D += c;
    else if (ev.rewardMethod) {
      otherReward.set(ev.rewardMethod, (otherReward.get(ev.rewardMethod) ?? 0) + c);
    } else {
      // rewardMethod 空的旧数据算入 C（现金），保底不丢
      C += c;
    }
  }

  return {
    A: B + C + D,
    B,
    C,
    D,
    expenseTotal,
    pendingCount,
    otherReward,
  };
}

export default async function HomePage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const s = await getSummary(user.id);

  return (
    <div className="px-6 pt-10">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-ink-500">{user.username} · 我的账本</div>
        <LogoutButton />
      </div>

      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-6 mt-4 shadow-sm">
        <div className="text-xs text-ink-500 mb-1">总收入 A = B + C + D (元)</div>
        <div className="num text-5xl font-bold" style={{ color: '#ff2d87' }}>
          {formatYuan(s.A)}
        </div>

        <div className="mt-5 space-y-2 text-sm">
          <Row label="B  工作账本 · 进项" value={s.B} className="text-ink-900 dark:text-ink-100" />
          <Row label="C  桃源 · 现金奖励" value={s.C} className="text-ink-900 dark:text-ink-100" />
          <Row
            label="D  桃源 · 京东卡奖励"
            value={s.D}
            className="text-ink-400 dark:text-ink-500"
          />
        </div>

        {s.otherReward.size > 0 && (
          <div className="mt-4 pt-3 border-t border-ink-100 dark:border-ink-700">
            <div className="text-[11px] text-ink-500 mb-1">
              以下奖励类型不计入 A，仅存档展示
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500 num">
              {[...s.otherReward.entries()].map(([k, v]) => (
                <span key={k}>
                  {rewardLabel(k)} {formatYuan(v)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 space-y-3">
        <Link
          href="/work"
          className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
        >
          <div>
            <div className="text-lg font-medium">工作账本</div>
            <div className="text-xs text-ink-500 mt-1">按月记录进项与出项</div>
          </div>
          <span className="text-ink-400">›</span>
        </Link>

        <Link
          href="/work/expenses"
          className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
        >
          <div>
            <div className="text-lg font-medium">工作出项汇总</div>
            <div className="text-xs text-ink-500 mt-1 num">
              合计 {formatYuan(s.expenseTotal)} · 出项不计入 A
            </div>
          </div>
          <span className="text-ink-400">›</span>
        </Link>

        <Link
          href="/taoyuan"
          className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
        >
          <div>
            <div className="text-lg font-medium flex items-center gap-2">
              桃源账本
              {s.pendingCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs rounded-full bg-red-500 text-white">
                  {s.pendingCount}
                </span>
              )}
            </div>
            <div className="text-xs text-ink-500 mt-1">活动发布 → 预测 → 公示 → 发钱</div>
          </div>
          <span className="text-ink-400">›</span>
        </Link>

        <ExportButton />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-ink-500">{label}</span>
      <span className={`num text-base font-medium ${className ?? ''}`}>{formatYuan(value)}</span>
    </div>
  );
}

function rewardLabel(k: string) {
  switch (k) {
    case 'qcoin':
      return 'Q币';
    case 'carrotcoin':
      return '萝卜币';
    case 'merch':
      return '周边';
    default:
      return k;
  }
}
