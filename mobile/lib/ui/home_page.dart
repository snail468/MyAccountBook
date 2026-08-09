import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/constants.dart';
import '../core/money.dart';
import '../state/auth_state.dart';
import '../state/ledger_list_state.dart';
import '../theme/app_theme.dart';
import '../theme/design_tokens.dart';
import 'routes.dart';
import 'settings_page.dart';
import 'stats/stats_page.dart';
import 'search/search_page.dart';
import 'bank/bank_page.dart';
import 'recurring/recurring_page.dart';
import 'trash/trash_page.dart';
import 'ledgers/manage_ledgers_page.dart';
import 'users/users_page.dart';
import 'widgets/ledger_feature_card.dart';
import 'widgets/app_card.dart';
import 'work/work_summary_page.dart';
import 'widgets/app_floating_button.dart';
import 'widgets/appearance_sheet.dart';
import '../data/local/work_entry_dao.dart';
import '../data/local/general_entry_dao.dart';
import '../data/local/event_dao.dart';
import '../data/local/trip_dao.dart';

/// 首页（设计 2:3 重做）。
///
/// 无底部 tab；右上悬浮钮（眼睛占位 / 设置）。复用 [LedgerListState] 的 load+sync。
class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  // 首页汇总（真实数据，来自各账本 DAO）
  int _monthIncome = 0;
  List<({String name, int income})> _incomeLines = const [];
  int _generalExpense = 0;
  int _generalIncome = 0;
  int _taoyuanEvents = 0;
  int _tripMembers = 0;
  int _tripSpent = 0;
  int _overspend = 0;
  bool _summaryLoading = true;

  @override
  void initState() {
    super.initState();
    // 保留现有首次加载 + 同步逻辑与错误提示
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final s = context.read<LedgerListState>();
      await s.load();
      try {
        await s.sync();
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('同步失败，请查看下方错误')),
          );
        }
      }
      await _loadSummary();
    });
  }

  /// 汇总首页真实数据：跨账本算本月收入/支出/超支/活动数/行程。
  Future<void> _loadSummary() async {
    try {
      final ledgers = context.read<LedgerListState>().all;
      final now = DateTime.now();
      final ym = '${now.year}-${now.month.toString().padLeft(2, '0')}';

      int monthIncome = 0;
      final incomeLines = <({String name, int income})>[];
      int generalExpense = 0;
      int generalIncome = 0;
      int taoyuanEvents = 0;
      int tripMembers = 0;
      int tripSpent = 0;
      int overspend = 0;

      for (final l in ledgers) {
        switch (l.kind) {
          case AppConfig.kindWork:
            final m = await WorkEntryDao().totalsByMonth(l.id);
            final cur = m[ym];
            if (cur != null && cur.income > 0) {
              monthIncome += cur.income;
              incomeLines.add((name: l.name, income: cur.income));
            }
          case AppConfig.kindGeneral:
            final t = await GeneralEntryDao().monthlyTotals(l.id, ym);
            generalExpense += t.expense;
            generalIncome += t.income;
            if (t.income > 0) {
              monthIncome += t.income;
              incomeLines.add((name: l.name, income: t.income));
            }
            if (l.budgetCents != null && t.expense > l.budgetCents!) {
              overspend += 1;
            }
          case AppConfig.kindTaoyuan:
            final evs = await EventDao().listByLedger(l.id);
            taoyuanEvents += evs.length;
          case AppConfig.kindTravel:
            final members = await TripDao().listMembers(l.id);
            final expenses = await TripDao().listExpenses(l.id);
            tripMembers += members.length;
            for (final e in expenses) {
              if (e.deletedAt == null) tripSpent += e.amountBaseCents;
            }
        }
      }

      if (!mounted) return;
      setState(() {
        _monthIncome = monthIncome;
        _incomeLines = incomeLines;
        _generalExpense = generalExpense;
        _generalIncome = generalIncome;
        _taoyuanEvents = taoyuanEvents;
        _tripMembers = tripMembers;
        _tripSpent = tripSpent;
        _overspend = overspend;
        _summaryLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _summaryLoading = false);
    }
  }

  List<Widget> _incomeBreakdown(Color ink500) {
    if (_summaryLoading) {
      return [Text('加载中…', style: TextStyle(color: ink500, fontSize: 12))];
    }
    if (_incomeLines.isEmpty) {
      return [
        Text('本月暂无记账收入', style: TextStyle(color: ink500, fontSize: 12))
      ];
    }
    return _incomeLines
        .map((l) => Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Text('${l.name} 进项 +${Money.formatCents(l.income)}',
                  style: TextStyle(color: ink500, fontSize: 12)),
            ))
        .toList();
  }

  /// 按 kind 跳转到对应账本页（复用已有账本对象，避免引用不存在页面）。
  void _openKind(BuildContext context, String kind, String name) {
    final ledgers = context.read<LedgerListState>().byKind(kind);
    if (ledgers.isNotEmpty) {
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => pageForLedger(ledgers.first)),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('「$name」账本尚未创建')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    // 本月总收入配色：正值=品牌粉（1:1 对齐网页端），负值=语义红，零=主墨色。
    final incomeColor = _monthIncome > 0
        ? (isDark ? AppColors.darkBrandPink : AppColors.lightBrandPink)
        : (_monthIncome < 0
            ? (isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed)
            : ink900);

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 48, 16, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ---- 头部 ----
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${auth.username ?? ''} · 心愿便利贴',
                        style: TextStyle(color: ink500, fontSize: 14),
                      ),
                      const SizedBox(height: 8),
                      GestureDetector(
                        onTap: () async {
                          await context.read<AuthState>().logout();
                        },
                        child: Text('退出',
                            style: TextStyle(color: ink900, fontSize: 14)),
                      ),
                    ],
                  ),
                ),
                AppFloatingButton(
                  icon: const Text('👁',
                      style: TextStyle(fontSize: 20)),
                  onPressed: () => showModalBottomSheet(
                    context: context,
                    backgroundColor: Colors.transparent,
                    builder: (_) => const AppearanceSheet(),
                  ),
                ),
                const SizedBox(width: 10),
                AppFloatingButton(
                  icon: const Text('✨',
                      style: TextStyle(fontSize: 20)),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const SettingsPage()),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // ---- 超支提示卡（即便玻璃主题也不磨砂） ----
            _OverspendCard(overspendCount: _overspend),
            const SizedBox(height: 12),

            // ---- 本月总收入卡 ----
            AppCard(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('本月总收入',
                        style: TextStyle(color: ink500, fontSize: 13)),
                    const SizedBox(height: 6),
                    Text(
                      Money.formatCents(_monthIncome),
                      style: TextStyle(
                        color: incomeColor, fontSize: 28, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 10),
                    ..._incomeBreakdown(ink500),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // ---- 功能列表（1:1 对齐 Ardot：单列纵向，卡片 64 高，间距 12）----
            Column(
              children: [
                LedgerFeatureCard(
                  icon: '💼',
                  title: '工作账本',
                  subtitle: '按月记录进项与出项',
                  onTap: () => _openKind(context, AppConfig.kindWork, '工作账本'),
                ),
                const SizedBox(height: 12),
                LedgerFeatureCard(
                  icon: '📤',
                  title: '工作出项汇总',
                  subtitle: '按月垫款与回款汇总',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const WorkSummaryPage()),
                  ),
                ),
                const SizedBox(height: 12),
                LedgerFeatureCard(
                  icon: '🌸',
                  title: '桃源账本',
                  subtitle: _taoyuanEvents == 0 ? '暂无活动' : '$_taoyuanEvents 个活动',
                  onTap: () =>
                      _openKind(context, AppConfig.kindTaoyuan, '桃源账本'),
                ),
                const SizedBox(height: 12),
                LedgerFeatureCard(
                  icon: '📒',
                  title: '家庭账本',
                  subtitle: _generalExpense == 0 && _generalIncome == 0
                      ? '本月暂无记账'
                      : '本月支出 ${Money.formatCents(_generalExpense)} · 收入 ${Money.formatCents(_generalIncome)}',
                  onTap: () =>
                      _openKind(context, AppConfig.kindGeneral, '家庭账本'),
                ),
                const SizedBox(height: 12),
                LedgerFeatureCard(
                  icon: '✈️',
                  title: '东京之旅',
                  subtitle: _tripMembers == 0
                      ? '暂无行程'
                      : '$_tripMembers 人 · 已花 ${Money.formatCents(_tripSpent)}',
                  onTap: () =>
                      _openKind(context, AppConfig.kindTravel, '东京之旅'),
                ),
                const SizedBox(height: 12),
                LedgerFeatureCard(
                  icon: '🔁',
                  title: '周期记账',
                  subtitle: '房租 · 订阅 · 工资，配一次自动记',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const RecurringPage()),
                  ),
                ),
                const SizedBox(height: 12),
                LedgerFeatureCard(
                  icon: '💳',
                  title: '银行卡备份',
                  subtitle: '加密存储卡号 · 查看需验密码',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const BankPage()),
                  ),
                ),
                const SizedBox(height: 12),
                LedgerFeatureCard(
                  icon: '📈',
                  title: '统计',
                  subtitle: '月度趋势 · 类别占比 · 环比同比',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const StatsPage()),
                  ),
                ),
                const SizedBox(height: 12),
                LedgerFeatureCard(
                  icon: '🔍',
                  title: '搜索',
                  subtitle: '跨账本按关键字 · 金额 · 时间 · 类别',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const SearchPage()),
                  ),
                ),
                const SizedBox(height: 12),
                _AddLedgerCard(
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const ManageLedgersPage()),
                  ),
                ),
                const SizedBox(height: 12),
                LedgerFeatureCard(
                  icon: '🗑️',
                  title: '回收站',
                  subtitle: '删除的记录 · 60 天内可恢复',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const TrashPage()),
                  ),
                ),
                const SizedBox(height: 12),
                LedgerFeatureCard(
                  icon: '👥',
                  title: '用户管理',
                  subtitle: '家庭成员 · 角色与权限',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const UsersPage()),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // ---- 页脚 ----
            Text('导出数据 · 导入数据 · 修改密码',
                style: TextStyle(color: ink400, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}

/// 超支提示卡：固定 overspendBg/overspendBorder，不磨砂。
class _OverspendCard extends StatelessWidget {
  final int overspendCount;
  const _OverspendCard({required this.overspendCount});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // 暗色下用 surface/border/ink 镜像；浅色保持现有 lightOverspend* 语义色。
    final bg = isDark ? AppColors.darkSurface : AppColors.lightOverspendBg;
    final border =
        isDark ? AppColors.darkBorder : AppColors.lightOverspendBorder;
    final titleColor =
        isDark ? AppColors.darkInk100 : AppColors.lightOverspendTitle;
    final detailColor =
        isDark ? AppColors.darkInk400 : AppColors.lightOverspendDetail;

    final title =
        overspendCount > 0 ? '⚠️ 分类预算超支' : '✅ 预算正常';
    final detail = overspendCount > 0
        ? '家庭账本 · $overspendCount 项超支 ›'
        : '本月账本均未超支';
    return Container(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: border, width: 1),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: InkWell(
        onTap: () {
          // 暂 no-op：跳转超支详情
        },
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(color: titleColor, fontSize: 12)),
                  const SizedBox(height: 2),
                  Text(detail,
                      style: TextStyle(color: detailColor, fontSize: 14)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 「添加 / 删除账本」卡片：surfaceSubtle 底 + 虚线 #CBD5E1 描边，标题副标 ink500。
class _AddLedgerCard extends StatelessWidget {
  final VoidCallback? onTap;
  const _AddLedgerCard({this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final dashed = isDark
        ? AppColors.darkBorder
        : AppColors.lightBorderDashed;
    final fill = isDark ? AppColors.darkSurface : AppColors.lightSurfaceSubtle;

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: dashed, width: 1),
        ),
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Text('＋', style: TextStyle(fontSize: 24)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('添加 / 删除账本',
                      style: TextStyle(color: ink500, fontSize: 18)),
                  const SizedBox(height: 2),
                  Text('新增账本 · 恢复回收站 · 管理已有',
                      style: TextStyle(color: ink400, fontSize: 12)),
                ],
              ),
            ),
            Text('›', style: TextStyle(color: ink500, fontSize: 20)),
          ],
        ),
      ),
    );
  }
}
