import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserWithRole } from '@/lib/session';
import { prisma } from '@/lib/db';
import { parseRewardMethods, rewardValueKind } from '@/lib/rewardMethod';
import {
  isIncomeComponentEnabled,
  parsePrefs,
  type IncomeComponentKey,
  type UserPrefs,
} from '@/lib/userPrefs';
import { NOT_DELETED } from '@/lib/softDelete';
import Money from '@/components/ui/Money';
import {
  bucketByMonth,
  categoryShare,
  monthOverMonth,
  recentMonthKeys,
  totals,
  windowStart,
  yearOverYear,
  type StatRow,
} from '@/lib/stats';
import TrendChart from './TrendChart';

export const dynamic = 'force-dynamic';

// 取 13 个月而不是 12：同比要拿去年同月做对比，差一个月就算不出来。
// 界面上只画最近 12 个月的折线，第 13 个月只参与同比计算。
const WINDOW_MONTHS = 13;

/**
 * 把四个账本的记录归一成统计行。
 *
 * 只取三列、且限定在 13 个月窗口内 —— 不像列表页那样需要 SQL 聚合，
 * 理由见 lib/stats.ts 顶部。
 */
async function loadRows(
  userId: string,
  since: Date,
  prefs: UserPrefs,
): Promise<StatRow[]> {
  // 统计只计入首页「总收入 A 的组成」里勾选的来源：用户显式取消勾选
  // （incomeComponents[key] === false）的分量不进统计。key 为 null 的行无对应
  // 开关（如桃源非现金/京东卡的金额奖励），始终计入。默认全开（缺失=启用）。
  const enabled = (key: IncomeComponentKey | null) =>
    key === null || isIncomeComponentEnabled(prefs, key);
  // 统计口径必须与首页「总收入组成」一致：只统计首页里出现、且被勾选的来源。
  //
  // 关键区分——首页两类分量的账本口径不同：
  //  - 工作 / 桃源在首页是**单一**分量（work / taoyuan:cash / taoyuan:jd），只代表
  //    「我自己创建的那一本」（owner），共享给我的工作/桃源账本不进首页分量；
  //  - 普通 / 旅游在首页是**逐账本**分量（general:<id> / general-expense:<id> /
  //    travel-expense:<id>），含共享账本（标题带 owner 前缀），每本都能单独勾选。
  //
  // 因此工作进项、桃源到账金额只能取 **我拥有的**账本（ledger.userId === 我），否则
  // 协作共享账本的进项会漏进统计、却在首页没有对应开关可取消（本次修复的 bug）。
  // 普通/旅游仍按成员口径（含共享），因为它们每本都是首页里独立可勾选的分量。
  const memberLedger = { members: { some: { userId } }, deletedAt: null };
  const ownedLedger = { userId, deletedAt: null };
  const [entries, generals, trips, paidAmounts] = await Promise.all([
    // 工作账本**只算进项**：出项本质是"垫款"，公司迟早回款，
    // 记进"支出"会让个人现金流看起来虚亏。回款条目也不需要单独算成收入 ——
    // 它们只是让原来的垫款归零，本身不是新收入。
    // 只取我拥有的工作账本，对齐首页 work 分量（owner-only）。
    prisma.entry.findMany({
      where: {
        ...NOT_DELETED,
        ledger: ownedLedger,
        direction: 'income',
        occurredAt: { gte: since },
      },
      select: { occurredAt: true, amountCents: true, direction: true, category: true },
    }),
    prisma.generalEntry.findMany({
      where: {
        ...NOT_DELETED,
        ledger: memberLedger,
        occurredAt: { gte: since },
      },
      select: {
        occurredAt: true,
        amountCents: true,
        direction: true,
        category: true,
        ledgerId: true,
      },
    }),
    prisma.tripExpense.findMany({
      where: {
        ...NOT_DELETED,
        ledger: memberLedger,
        occurredAt: { gte: since },
      },
      select: { occurredAt: true, amountBaseCents: true, category: true, ledgerId: true },
    }),
    // 桃源账本只把**已到账**的钱算进收入 —— 预测和公示都还没落袋，
    // 混进统计会让"收入"虚高。
    // 只取我拥有的桃源账本，对齐首页 taoyuan:cash / taoyuan:jd 分量（owner-only）。
    prisma.eventAmount.findMany({
      where: {
        ...NOT_DELETED,
        event: { ledger: ownedLedger, ...NOT_DELETED },
        stage: 'paid',
        occurredAt: { gte: since },
      },
      select: {
        occurredAt: true,
        cents: true,
        rewardMethod: true,
        event: { select: { topicTag: true, rewardMethod: true, rewardMethods: true } },
      },
    }),
  ]);

  return [
    // 工作账本进项统一对应分量 'work'。
    ...(enabled('work')
      ? entries.map((e) => ({
          occurredAt: e.occurredAt,
          amountCents: e.amountCents,
          direction: (e.direction === 'income' ? 'income' : 'expense') as StatRow['direction'],
          category: e.category,
          sourceLabel: '工作账本',
        }))
      : []),
    ...generals
      // 进项对应 'general:<id>'，出项对应 'general-expense:<id>'。
      .filter((g) =>
        enabled(
          (g.direction === 'income'
            ? `general:${g.ledgerId}`
            : `general-expense:${g.ledgerId}`) as IncomeComponentKey,
        ),
      )
      .map((g) => ({
        occurredAt: g.occurredAt,
        amountCents: g.amountCents,
        direction: (g.direction === 'income' ? 'income' : 'expense') as StatRow['direction'],
        category: g.category,
        sourceLabel: '普通账本',
      })),
    ...trips
      .filter((t) => enabled(`travel-expense:${t.ledgerId}` as IncomeComponentKey))
      .map((t) => ({
        occurredAt: t.occurredAt,
        amountCents: t.amountBaseCents,
        direction: 'expense' as const,
        category: t.category,
        sourceLabel: '旅游账本',
      })),
    // 只把**金额类**奖励计入收入 —— Q币个数、周边件数不是钱，
    // 混进来会让总收入凭空多出一堆不存在的钱
    ...paidAmounts
      .filter((a) => {
        const method =
          a.rewardMethod ??
          parseRewardMethods(a.event.rewardMethods, a.event.rewardMethod)[0] ??
          null;
        if (rewardValueKind(method) !== 'money') return false;
        // 首页只把现金/京东卡两种金额奖励拆成分量；其它金额奖励无对应开关，
        // 始终计入（key=null）。
        const key: IncomeComponentKey | null =
          method === 'cash' ? 'taoyuan:cash' : method === 'jdcard' ? 'taoyuan:jd' : null;
        return enabled(key);
      })
      .map((a) => ({
        occurredAt: a.occurredAt,
        amountCents: a.cents,
        direction: 'income' as const,
        category: a.event.topicTag?.trim() || '桃源奖励',
        sourceLabel: '桃源账本',
      })),
  ];
}

function ChangeBadge({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="text-ink-400 text-xs">—</span>;
  }
  const up = percent > 0;
  const flat = percent === 0;
  return (
    <span
      className={`text-xs ${
        flat
          ? 'text-ink-400'
          : up
            ? 'text-red-500 dark:text-red-400'
            : 'text-emerald-600 dark:text-emerald-400'
      }`}
    >
      {up ? '↑' : flat ? '' : '↓'} {Math.abs(percent)}%
    </span>
  );
}

export default async function StatsPage() {
  const user = await requireUserWithRole();
  if (!user) redirect('/login');

  const now = new Date();
  const keys = recentMonthKeys(now, WINDOW_MONTHS);
  // 读用户偏好里的「总收入组成」勾选，统计据此过滤来源。
  const userRow = await prisma.user.findUnique({
    where: { id: user.id },
    select: { preferences: true },
  });
  const prefs = parsePrefs(userRow?.preferences ?? null);
  const rows = await loadRows(user.id, windowStart(now, WINDOW_MONTHS), prefs);

  const buckets = bucketByMonth(rows, keys);
  // 折线只画最近 12 个月；第 13 个月是给同比垫底的
  const visible = buckets.slice(1);
  const t = totals(visible);
  const mom = monthOverMonth(buckets);
  const yoy = yearOverYear(buckets);

  const expenseShare = categoryShare(rows, 'expense');
  const incomeShare = categoryShare(rows, 'income');
  const hasData = rows.length > 0;

  return (
    <div className="px-4 pt-14 pb-24 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-ink-500 text-sm">
          ‹ 返回
        </Link>
        <h1 className="text-2xl font-semibold flex-1">统计</h1>
      </div>
      <p className="text-xs text-ink-500">按「总收入组成」勾选的来源 · 最近 12 个月</p>

      {!hasData && (
        <p className="text-ink-500 text-sm py-12 text-center">
          最近 12 个月还没有记录，记几笔之后这里就有内容了
        </p>
      )}

      {hasData && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '总收入', cents: t.income },
              { label: '总支出', cents: t.expense },
              { label: '结余', cents: t.net },
            ].map((c) => (
              <div
                key={c.label}
                className="p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700"
              >
                <div className="text-[11px] text-ink-500">{c.label}</div>
                <div className="text-sm font-medium mt-1 tabular-nums">
                  <Money cents={c.cents} />
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
            <div className="text-sm font-medium mb-3">月度收支趋势</div>
            <TrendChart buckets={visible} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
              <div className="text-[11px] text-ink-500 mb-2">环比（vs 上月）</div>
              {mom ? (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ink-500">收入</span>
                    <ChangeBadge percent={mom.income.changePercent} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-500">支出</span>
                    <ChangeBadge percent={mom.expense.changePercent} />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-400">数据不足</p>
              )}
            </div>
            <div className="p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
              <div className="text-[11px] text-ink-500 mb-2">同比（vs 去年同月）</div>
              {yoy ? (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ink-500">收入</span>
                    <ChangeBadge percent={yoy.income.changePercent} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-500">支出</span>
                    <ChangeBadge percent={yoy.expense.changePercent} />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-400">还没满一年</p>
              )}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
            <div className="text-[11px] text-ink-500">月均支出（只按有记录的月份摊）</div>
            <div className="text-lg font-medium mt-1 tabular-nums">
              <Money cents={t.avgMonthlyExpense} />
            </div>
          </div>

          {[
            { title: '支出构成', share: expenseShare },
            { title: '收入构成', share: incomeShare },
          ].map(
            ({ title, share }) =>
              share.length > 0 && (
                <div
                  key={title}
                  className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700"
                >
                  <div className="text-sm font-medium mb-3">{title}</div>
                  <div className="space-y-2">
                    {share.map((s) => (
                      <div key={s.category}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="truncate">{s.category}</span>
                          <span className="text-ink-500 shrink-0 ml-2 tabular-nums">
                            <Money cents={s.cents} /> · {s.percent}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-ink-900 dark:bg-ink-100"
                            style={{ width: `${Math.min(100, s.percent)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ),
          )}
        </>
      )}
    </div>
  );
}
