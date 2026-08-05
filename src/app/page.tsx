import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserWithRole } from '@/lib/session';
import { prisma } from '@/lib/db';
import { ensureLegacyMigrated } from '@/lib/legacyMigrate';
import { ensureUserSetupOnce, maintenanceTick, runStartupTasks } from '@/lib/bootstrap';
import { materializeDueRules } from '@/lib/recurringRun';
import { parseRewardMethods, rewardValueKind } from '@/lib/rewardMethod';
import { NOT_DELETED } from '@/lib/softDelete';
import { parseCustom } from '@/lib/generalCategories';
import {
  isIncomeComponentEnabled,
  letterFor,
  parsePrefs,
  type IncomeComponentKey,
} from '@/lib/userPrefs';
import LogoutButton from '@/components/LogoutButton';
import ExportButton from '@/components/ExportButton';
import ImportButton from '@/components/ImportButton';
import ChangePasswordButton from '@/components/ChangePasswordButton';
import Money from '@/components/ui/Money';
import Prefetcher from '@/components/ui/Prefetcher';
import OfflineWarmer, { type WarmableLedger } from '@/components/ui/OfflineWarmer';
import IncomeComponentsCard from './IncomeComponentsCard';
import type { IncomeComponent } from './IncomeComponentsCard';

export const dynamic = 'force-dynamic';

async function loadDashboard(userId: string) {
  // 全局一次性初始化（admin bootstrap / 归档迁移），进程级 flag 去重
  await runStartupTasks();
  await ensureLegacyMigrated();
  // 兜底：升级前就已登录、会话还没过期的老用户走不到登录路径，
  // 在这里把 Ledger 元数据补上（进程级去重，每用户只跑一次）
  await ensureUserSetupOnce(userId);
  // 回收站到期清理的触发点，内部有 1 小时节流
  await maintenanceTick();
  // 周期记账的生成触发点。没有常驻调度器，用户打开首页时补齐即可 ——
  // 理由与补跑机制见 lib/recurringRun.ts。失败绝不能让首页打不开
  try {
    await materializeDueRules(userId);
  } catch {
    /* 内部已记日志 */
  }

  const [ledgers, userRow] = await Promise.all([
    prisma.ledger.findMany({
      where: { userId, archived: false, deletedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    }),
    // 用户偏好 —— 用来过滤"总收入 A"里启用的组件
    prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } }),
  ]);
  const prefs = parsePrefs(userRow?.preferences ?? null);

  const hasWork = ledgers.some((l) => l.kind === 'work');
  const hasTaoyuan = ledgers.some((l) => l.kind === 'taoyuan');

  // 工作数据 —— 用 SQL 聚合，不再把全部条目拉进内存
  const workSums = hasWork
    ? await prisma.entry.groupBy({
        by: ['direction'],
        where: { userId, ...NOT_DELETED },
        _sum: { amountCents: true },
      })
    : [];
  const workSumOf = (dir: string) =>
    workSums.find((r) => r.direction === dir)?._sum.amountCents ?? 0;
  const B = workSumOf('income');
  const expenseTotal = workSumOf('expense');

  // 桃源数据
  const paidAmounts = hasTaoyuan
    ? await prisma.eventAmount.findMany({
        // event 的软删也要一起过滤 —— 单独删活动时下面的金额行不会被级联软删，
        // 但活动都在回收站了，它的金额自然不该出现在首页
        where: { stage: 'paid', ...NOT_DELETED, event: { userId, ...NOT_DELETED } },
        select: {
          cents: true,
          quantity: true,
          itemDesc: true,
          rewardMethod: true,
          event: { select: { rewardMethod: true, rewardMethods: true } },
        },
      })
    : [];
  let C = 0;
  let D = 0;
  // 金额类的其它方式（将来新增的现金等价物）仍按金额汇总
  const otherReward = new Map<string, number>();
  // 非金额奖励单独汇总：个数类累加个数，文字类收集名目。
  // **绝不并入 A/C/D** —— 200 个 Q币不是 200 分钱，加进总收入就把账算错了
  const countReward = new Map<string, number>();
  const textReward = new Map<string, string[]>();
  for (const a of paidAmounts) {
    let method = a.rewardMethod;
    if (!method) {
      const methods = parseRewardMethods(a.event.rewardMethods, a.event.rewardMethod);
      method = methods[0] ?? null;
    }
    const kind = rewardValueKind(method);
    if (kind === 'count') {
      if (method) countReward.set(method, (countReward.get(method) ?? 0) + (a.quantity ?? 0));
      continue;
    }
    if (kind === 'text') {
      if (method && a.itemDesc) {
        const list = textReward.get(method) ?? [];
        if (!list.includes(a.itemDesc)) list.push(a.itemDesc);
        textReward.set(method, list);
      }
      continue;
    }
    if (method === 'cash') C += a.cents;
    else if (method === 'jdcard') D += a.cents;
    else if (method) otherReward.set(method, (otherReward.get(method) ?? 0) + a.cents);
    else C += a.cents;
  }

  const pendingCount = hasTaoyuan
    ? await prisma.event.count({
        where: {
          userId,
          ...NOT_DELETED,
          status: { in: ['published', 'predicted', 'announced'] },
        },
      })
    : 0;

  // 其它自建账本的小卡片数据
  //
  // 原来这里是 for 循环里逐个账本发查询（N+1）—— 账本一多首页就线性变慢。
  // 现在改成按类型各发一组 groupBy，总查询数固定为 3 条，与账本数量无关。
  const generalIds = ledgers.filter((l) => l.kind === 'general').map((l) => l.id);
  const travelIds = ledgers.filter((l) => l.kind === 'travel').map((l) => l.id);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  // 本周（周一起）——与 /l/[id] 的口径一致
  const dow = now.getDay();
  const daysSinceMonday = (dow + 6) % 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  // 收集有预算的账本 —— 没设任何分类预算就不查每类花销，省一次 groupBy
  const budgetedGeneral = ledgers
    .filter((l) => l.kind === 'general')
    .map((l) => {
      const c = parseCustom(l.customCategories);
      return {
        id: l.id,
        name: l.name,
        monthBudgets: c.budgets ?? {},
        weekBudgets: c.budgetsWeekly ?? {},
      };
    })
    .filter((l) => Object.keys(l.monthBudgets).length + Object.keys(l.weekBudgets).length > 0);

  const [
    generalSums,
    generalCumulativeSums,
    travelSums,
    travelMemberCounts,
    budgetSpendMonth,
    budgetSpendWeek,
  ] = await Promise.all([
    generalIds.length > 0
      ? prisma.generalEntry.groupBy({
          by: ['ledgerId', 'direction'],
          where: {
            ledgerId: { in: generalIds },
            ...NOT_DELETED,
            occurredAt: { gte: monthStart, lt: monthEnd },
          },
          _sum: { amountCents: true },
        })
      : Promise.resolve([]),
    // 普通账本的**累计**收/支 —— 供"总收入 A"里的正/负分量使用。
    // 与 B/C/D 口径一致：累计而不是本月，这样长期趋势稳定；界面上每张普通账本
    // 卡片里的"本月支出/收入"另有一份 groupBy（generalSums）走的是本月口径。
    // 一次 groupBy 拿两个 direction，避免为 income/expense 各发一条。
    generalIds.length > 0
      ? prisma.generalEntry.groupBy({
          by: ['ledgerId', 'direction'],
          where: { ledgerId: { in: generalIds }, ...NOT_DELETED },
          _sum: { amountCents: true },
        })
      : Promise.resolve([]),
    travelIds.length > 0
      ? prisma.tripExpense.groupBy({
          by: ['ledgerId'],
          where: { ledgerId: { in: travelIds }, ...NOT_DELETED },
          _sum: { amountBaseCents: true },
        })
      : Promise.resolve([]),
    travelIds.length > 0
      ? prisma.tripMember.groupBy({
          by: ['ledgerId'],
          where: { ledgerId: { in: travelIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    // 有分类月预算的账本才查当月类别花销 —— groupBy 只跑一次覆盖多账本
    budgetedGeneral.some((l) => Object.keys(l.monthBudgets).length > 0)
      ? prisma.generalEntry.groupBy({
          by: ['ledgerId', 'category'],
          where: {
            ledgerId: { in: budgetedGeneral.map((l) => l.id) },
            ...NOT_DELETED,
            direction: 'expense',
            occurredAt: { gte: monthStart, lt: monthEnd },
          },
          _sum: { amountCents: true },
        })
      : Promise.resolve([]),
    // 有分类周预算的账本查本周花销
    budgetedGeneral.some((l) => Object.keys(l.weekBudgets).length > 0)
      ? prisma.generalEntry.groupBy({
          by: ['ledgerId', 'category'],
          where: {
            ledgerId: { in: budgetedGeneral.map((l) => l.id) },
            ...NOT_DELETED,
            direction: 'expense',
            occurredAt: { gte: weekStart, lt: weekEnd },
          },
          _sum: { amountCents: true },
        })
      : Promise.resolve([]),
  ]);

  // 汇总各账本的超支类别数（月 + 周合并计数，同一类别双超算 2 项 —— 用户想看到具体多严重）
  type OverInfo = { ledgerId: string; ledgerName: string; overCount: number };
  const overByLedger = new Map<string, OverInfo>();
  const bumpOver = (l: (typeof budgetedGeneral)[number]) => {
    let info = overByLedger.get(l.id);
    if (!info) {
      info = { ledgerId: l.id, ledgerName: l.name, overCount: 0 };
      overByLedger.set(l.id, info);
    }
    info.overCount += 1;
  };
  for (const l of budgetedGeneral) {
    for (const [cat, budget] of Object.entries(l.monthBudgets)) {
      const spent =
        budgetSpendMonth.find((r) => r.ledgerId === l.id && r.category === cat)?._sum
          .amountCents ?? 0;
      if (spent > budget) bumpOver(l);
    }
    for (const [cat, budget] of Object.entries(l.weekBudgets)) {
      const spent =
        budgetSpendWeek.find((r) => r.ledgerId === l.id && r.category === cat)?._sum
          .amountCents ?? 0;
      if (spent > budget) bumpOver(l);
    }
  }
  const overLedgers = [...overByLedger.values()].filter((o) => o.overCount > 0);

  const generalSumOf = (ledgerId: string, dir: string) =>
    generalSums.find((r) => r.ledgerId === ledgerId && r.direction === dir)?._sum
      .amountCents ?? 0;
  const travelTotalOf = (ledgerId: string) =>
    travelSums.find((r) => r.ledgerId === ledgerId)?._sum.amountBaseCents ?? 0;
  const travelMembersOf = (ledgerId: string) =>
    travelMemberCounts.find((r) => r.ledgerId === ledgerId)?._count._all ?? 0;

  const otherLedgers = ledgers.filter((l) => l.kind === 'general' || l.kind === 'travel');
  const ledgerCards: {
    id: string;
    kind: string;
    name: string;
    icon: string | null;
    summary: string;
    accent: string | null;
  }[] = [];
  for (const l of otherLedgers) {
    let summary: string;
    if (l.kind === 'general') {
      const income = generalSumOf(l.id, 'income');
      const expense = generalSumOf(l.id, 'expense');
      summary = `本月支出 ${(expense / 100).toFixed(2)} · 收入 ${(income / 100).toFixed(2)}`;
      if (l.budgetCents && l.budgetCents > 0) {
        summary += ` · 预算 ${Math.round((expense / l.budgetCents) * 100)}%`;
      }
    } else {
      const total = travelTotalOf(l.id);
      summary = `${travelMembersOf(l.id)} 人 · 已花 ${(total / 100).toFixed(2)} ${l.baseCurrency ?? ''}`;
    }
    ledgerCards.push({
      id: l.id,
      kind: l.kind,
      name: l.name,
      icon: l.icon,
      summary,
      accent: null,
    });
  }

  // "总收入 A" 的组成清单。key 是稳定标识（见 lib/userPrefs.ts），letter 是渲染
  // 顺序里的展示层字母。B/C/D 固定语义；E 起按账本 order 依次分配。
  // sign=+1 是进项（加），sign=-1 是出项（减）。默认全开，新增账本会自动进 A。
  //
  // 排列顺序：先所有进项分量（B/C/D 固定，再普通账本进项），后所有出项分量
  // （每本普通账本出项，再每本旅游账本出项）。这样字母顺序与视觉分组同步。
  const components: IncomeComponent[] = [];
  const push = (
    key: IncomeComponentKey,
    name: string,
    cents: number,
    sign: 1 | -1,
  ) => {
    components.push({
      key,
      letter: letterFor(components.length),
      name,
      cents,
      sign,
      enabled: isIncomeComponentEnabled(prefs, key),
    });
  };
  if (hasWork) push('work', '工作账本 · 进项', B, 1);
  if (hasTaoyuan) {
    push('taoyuan:cash', '桃源 · 现金奖励', C, 1);
    push('taoyuan:jd', '桃源 · 京东卡奖励', D, 1);
  }
  // 普通账本按 ledgers 顺序（order asc）—— generalLedgers 保持这个顺序
  const generalLedgers = ledgers.filter((l) => l.kind === 'general');
  const generalCumOf = (ledgerId: string, dir: string) =>
    generalCumulativeSums.find((r) => r.ledgerId === ledgerId && r.direction === dir)?._sum
      .amountCents ?? 0;
  for (const l of generalLedgers) {
    push(`general:${l.id}` as IncomeComponentKey, `${l.name} · 进项`, generalCumOf(l.id, 'income'), 1);
  }
  // 出项减项（工作/桃源不在这里 —— 工作出项是垫款迟早回款，桃源没出项概念）
  for (const l of generalLedgers) {
    push(
      `general-expense:${l.id}` as IncomeComponentKey,
      `${l.name} · 出项`,
      generalCumOf(l.id, 'expense'),
      -1,
    );
  }
  const travelLedgers = ledgers.filter((l) => l.kind === 'travel');
  const travelCumOf = (ledgerId: string) =>
    travelSums.find((r) => r.ledgerId === ledgerId)?._sum.amountBaseCents ?? 0;
  for (const l of travelLedgers) {
    push(
      `travel-expense:${l.id}` as IncomeComponentKey,
      `${l.name} · 出项`,
      travelCumOf(l.id),
      -1,
    );
  }
  const A = components
    .filter((c) => c.enabled)
    .reduce((sum, c) => sum + c.cents * c.sign, 0);

  return {
    hasWork,
    hasTaoyuan,
    components,
    A,
    expenseTotal,
    pendingCount,
    otherReward: [...otherReward.entries()],
    countReward: [...countReward.entries()],
    textReward: [...textReward.entries()],
    ledgerCards,
    overLedgers,
  };
}

export default async function HomePage() {
  const user = await requireUserWithRole();
  if (!user) redirect('/login');

  const s = await loadDashboard(user.id);

  // 预取所有可能的目标路由
  const prefetchRoutes: string[] = ['/ledgers', '/trash'];
  if (s.hasWork) prefetchRoutes.push('/work', '/work/expenses');
  if (s.hasTaoyuan) prefetchRoutes.push('/taoyuan');
  if (user.role === 'admin') prefetchRoutes.push('/admin');
  for (const c of s.ledgerCards) prefetchRoutes.push(`/l/${c.id}`);

  // 离线预热：把用户所有普通/旅游账本的 HTML 拉进 SW 缓存，
  // 断网后点账本卡片能直接进入 GeneralView 而不是掉到 offline.html。
  const warmableLedgers: WarmableLedger[] = s.ledgerCards
    .filter((c) => c.kind === 'general' || c.kind === 'travel')
    .map((c) => ({
      id: c.id,
      kind: c.kind as 'general' | 'travel',
      name: c.name,
      icon: c.icon,
    }));
  const warmExtraUrls: string[] = [];
  if (s.hasWork) warmExtraUrls.push('/work');
  if (s.hasTaoyuan) warmExtraUrls.push('/taoyuan');

  return (
    <div className="px-6 pt-14">
      <Prefetcher routes={prefetchRoutes} />
      <OfflineWarmer ledgers={warmableLedgers} extraUrls={warmExtraUrls} />
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-ink-500">{user.username} · 心愿便利贴</div>
        <LogoutButton />
      </div>

      {s.overLedgers.length > 0 && (
        <div className="mt-3 rounded-3xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <div className="text-xs text-red-800 dark:text-red-300 font-medium">
            ⚠️ 分类预算超支
          </div>
          <div className="mt-1.5 space-y-1">
            {s.overLedgers.map((o) => (
              <Link
                key={o.ledgerId}
                href={`/l/${o.ledgerId}`}
                className="flex items-center justify-between text-sm text-red-900 dark:text-red-200"
              >
                <span className="truncate">{o.ledgerName}</span>
                <span className="shrink-0 text-[11px]">
                  {o.overCount} 项超支 ›
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {s.components.length > 0 && (
        <IncomeComponentsCard
          components={s.components}
          A={s.A}
          otherReward={s.otherReward}
          countReward={s.countReward}
          textReward={s.textReward}
        />
      )}

      <div className="mt-8 space-y-3">
        {s.hasWork && (
          <>
            <Link
              href="/work"
              className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl">💼</span>
                <div className="min-w-0">
                  <div className="text-lg font-medium">工作账本</div>
                  <div className="text-xs text-ink-500 mt-0.5">按月记录进项与出项</div>
                </div>
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
                  合计 <Money cents={s.expenseTotal} />
                </div>
              </div>
              <span className="text-ink-400">›</span>
            </Link>
          </>
        )}

        {s.hasTaoyuan && (
          <Link
            href="/taoyuan"
            className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xl">🌸</span>
              <div className="min-w-0">
                <div className="text-lg font-medium flex items-center gap-2">
                  桃源账本
                  {s.pendingCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs rounded-full bg-red-500 text-white">
                      {s.pendingCount}
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-500 mt-0.5">活动发布 → 预测 → 公示 → 发钱</div>
              </div>
            </div>
            <span className="text-ink-400">›</span>
          </Link>
        )}

        {s.ledgerCards.map((c) => {
          const over = s.overLedgers.find((o) => o.ledgerId === c.id);
          return (
            <Link
              key={c.id}
              href={`/l/${c.id}`}
              className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl">{c.icon ?? (c.kind === 'travel' ? '✈️' : '📒')}</span>
                <div className="min-w-0">
                  <div className="text-lg font-medium truncate flex items-center gap-2">
                    <span className="truncate">{c.name}</span>
                    {over && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white">
                        超支 {over.overCount}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-500 mt-0.5 truncate">{c.summary}</div>
                </div>
              </div>
              <span className="text-ink-400">›</span>
            </Link>
          );
        })}

        <Link
          href="/recurring"
          className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔁</span>
            <div>
              <div className="text-lg font-medium">周期记账</div>
              <div className="text-xs text-ink-500 mt-0.5">房租 · 订阅 · 工资，配一次自动记</div>
            </div>
          </div>
          <span className="text-ink-400">›</span>
        </Link>

        <Link
          href="/cards"
          className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">💳</span>
            <div>
              <div className="text-lg font-medium">银行卡备份</div>
              <div className="text-xs text-ink-500 mt-0.5">加密存储卡号 · 查看需验密码</div>
            </div>
          </div>
          <span className="text-ink-400">›</span>
        </Link>

        <Link
          href="/stats"
          className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">📈</span>
            <div>
              <div className="text-lg font-medium">统计</div>
              <div className="text-xs text-ink-500 mt-0.5">
                月度趋势 · 类别占比 · 环比同比
              </div>
            </div>
          </div>
          <span className="text-ink-400">›</span>
        </Link>

        <Link
          href="/search"
          className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔍</span>
            <div>
              <div className="text-lg font-medium">搜索</div>
              <div className="text-xs text-ink-500 mt-0.5">
                跨账本按关键字 · 金额 · 时间 · 类别查找
              </div>
            </div>
          </div>
          <span className="text-ink-400">›</span>
        </Link>

        <Link
          href="/ledgers"
          className="flex items-center justify-between p-5 rounded-2xl border-2 border-dashed border-ink-300 dark:border-ink-600 text-ink-500 active:scale-[0.98] transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">＋</span>
            <div>
              <div className="text-lg font-medium">添加 / 删除账本</div>
              <div className="text-xs mt-0.5">新增账本 · 恢复回收站 · 管理已有</div>
            </div>
          </div>
          <span>›</span>
        </Link>

        <Link
          href="/trash"
          className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🗑️</span>
            <div>
              <div className="text-lg font-medium">回收站</div>
              <div className="text-xs text-ink-500 mt-0.5">删除的记录 · 60 天内可恢复</div>
            </div>
          </div>
          <span className="text-ink-400">›</span>
        </Link>

        <ExportButton />

        <ImportButton />

        <ChangePasswordButton />

        {user.role === 'admin' && (
          <Link
            href="/admin"
            className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
          >
            <div>
              <div className="text-lg font-medium">用户管理</div>
              <div className="text-xs text-ink-500 mt-1">管理员专属：新增/删除/重置用户</div>
            </div>
            <span className="text-ink-400">›</span>
          </Link>
        )}
      </div>
    </div>
  );
}

