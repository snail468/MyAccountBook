import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/constants.dart';
import '../core/general_categories.dart';
import '../core/money.dart' as money;
import '../state/auth_state.dart';
import '../state/ledger_list_state.dart';
import '../theme/app_theme.dart';
import '../theme/design_tokens.dart';
import 'routes.dart';
import 'work/work_summary_page.dart';
import 'recurring/recurring_page.dart';
import 'bank/bank_page.dart';
import 'stats/stats_page.dart';
import 'search/search_page.dart';
import 'ledgers/manage_ledgers_page.dart';
import 'trash/trash_page.dart';
import 'users/users_page.dart';
import 'widgets/ledger_feature_card.dart';
import 'widgets/floating_toolbar.dart';
import 'widgets/money.dart';
import 'home/income_components_card.dart';
import 'home/overspend_card.dart';
import 'home/backup_sheets.dart';
import 'home/onboarding_guide.dart';
import '../data/local/work_entry_dao.dart';
import '../data/local/general_entry_dao.dart';
import '../data/local/event_dao.dart';
import '../data/local/trip_dao.dart';
import '../data/models/ledger.dart';

/// 首页（1:1 对齐网页端 src/app/page.tsx）。
///
/// 无底部 tab；右上悬浮工具条（眼睛切换金额可见 + 设置）。
/// 卡片顺序严格对齐网页端：
/// 超支卡（按需）→ 总收入 A 卡 → 工作账本 / 工作出项汇总 / 桃源账本 /
/// 普通·旅游账本 / 周期记账 / 银行卡备份 / 统计 / 搜索 / 添加删除账本(虚线) /
/// 回收站 / 导出备份 / 导入还原 / 修改密码 / 用户管理(admin)。
class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

/// 首页普通/旅游账本卡片的数据壳（带汇总文案 + 超支角标）。
class _HomeLedgerCard {
  final Ledger ledger;
  final String summary;
  final int overCount;
  _HomeLedgerCard({
    required this.ledger,
    required this.summary,
    this.overCount = 0,
  });
}

class _HomePageState extends State<HomePage> {
  // 汇总数据
  List<IncomeComponent> _components = const [];
  Map<String, int> _otherReward = const {};
  Map<String, int> _countReward = const {};
  Map<String, List<String>> _textReward = const {};
  List<OverLedger> _overLedgers = const [];
  List<_HomeLedgerCard> _ledgerCards = const [];
  int _workExpenseTotal = 0;
  int _pendingCount = 0;
  Ledger? _ownWork;
  Ledger? _ownTaoyuan;
  // 共享账本（本地无 userId 概念，沿用 own=同类型首本的口径：
  // 同类型里除首本外的账本视为"被共享给我的"，对齐网页端 sharedWork/taoyuanLedgers）。
  List<Ledger> _sharedWorkLedgers = const [];
  List<Ledger> _sharedTaoyuanLedgers = const [];
  Map<String, int> _sharedWorkCount = const {};
  Map<String, int> _sharedTaoyuanCount = const {};

  @override
  void initState() {
    super.initState();
    // 本地优先启动：先渲染本地已缓存账本与汇总（即时），再后台同步。[#2]
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _bootstrap();
    });
  }

  /// 先展示本地数据（即时），再后台做「先推后拉」同步，完成后刷新汇总。
  /// 不再阻塞首屏等待服务端全量拉取，符合「本地存一份数据、重开即显示」的诉求。[#2]
  Future<void> _bootstrap() async {
    final s = context.read<LedgerListState>();
    await s.load(); // 本地库，瞬时
    if (!mounted) return;
    await _loadSummary(); // 用本地数据即时渲染首页卡片
    // 后台同步：先推本地改动，再从服务端拉取（目前仍为全量，但不再阻塞 UI）。
    _syncInBackground(s);
    // 首次启动自动弹出「使用引导」（对齐网页端 ?welcome=1 的落地页引导）。
    await OnboardingGuide.maybeShowOnFirstLaunch(context);
  }

  /// 后台同步（不阻塞首屏）。完成后用最新数据刷新首页汇总；
  /// 失败则提示但仍保留已渲染的本地缓存数据。[#2]
  Future<void> _syncInBackground(LedgerListState s) async {
    try {
      await s.sync();
      if (!mounted) return;
      await _loadSummary();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('同步失败，已显示本地缓存数据')),
      );
    }
  }

  /// 汇总首页真实数据（对齐网页端 loadDashboard 的口径）。
  ///
  /// 关键口径：
  ///  - 「总收入 A」的分量用**累计**（不限月份）；
  ///  - 普通/旅游账本卡片上的汇总用**本月**口径；
  ///  - 超支检测用账本的分类预算（月 + 周）对比本月/本周类别支出。
  Future<void> _loadSummary() async {
    try {
      final ledgers = context.read<LedgerListState>().all;

      final workLedgers =
          ledgers.where((l) => l.kind == AppConfig.kindWork).toList();
      final taoyuanLedgers =
          ledgers.where((l) => l.kind == AppConfig.kindTaoyuan).toList();
      final generalLedgers =
          ledgers.where((l) => l.kind == AppConfig.kindGeneral).toList();
      final travelLedgers =
          ledgers.where((l) => l.kind == AppConfig.kindTravel).toList();

      // 网页端只把"自己创建的第一本"工作/桃源计入首页综合视图。
      // 以服务端 isOwn 判定归属（而非位置）：被共享给我的账本即便排序靠前也不误判为"我的"，
      // 从而正确归入下方共享段并用 owner 前缀显示 [#3]。
      _ownWork = _pickOwn(workLedgers);
      _ownTaoyuan = _pickOwn(taoyuanLedgers);

      // ---- 共享 work/taoyuan 卡片（对齐网页端 sharedWork/taoyuanLedgers） ----
      // 非本人所有的账本（isOwn!=true）视为被共享给我的；其标题走 displayName 自动带 owner 前缀 [#3]。
      final sharedWorkLedgers =
          workLedgers.where((l) => l != _ownWork && l.isOwn != true).toList();
      final sharedTaoyuanLedgers =
          taoyuanLedgers.where((l) => l != _ownTaoyuan && l.isOwn != true).toList();
      final sharedWorkCount = <String, int>{};
      for (final l in sharedWorkLedgers) {
        sharedWorkCount[l.id] =
            (await WorkEntryDao().listByLedger(l.id)).length;
      }
      final sharedTaoyuanCount = <String, int>{};
      for (final l in sharedTaoyuanLedgers) {
        sharedTaoyuanCount[l.id] = await EventDao().pendingCount(l.id);
      }

      // ---- 总收入 A 的分量 ----
      final components = <IncomeComponent>[];
      String letterFor() => String.fromCharCode(66 + components.length); // B,C,D…

      int B = 0;
      if (_ownWork != null) {
        B = (await WorkEntryDao().cumulativeTotals(_ownWork!.id)).income;
      }
      int C = 0, D = 0;
      if (_ownTaoyuan != null) {
        final r = await EventDao().rewardTotals(_ownTaoyuan!.id);
        C = r.cash;
        D = r.jdcard;
        _otherReward = r.other;
        _countReward = r.count;
        _textReward = r.text;
        _pendingCount = await EventDao().pendingCount(_ownTaoyuan!.id);
      }

      if (_ownWork != null) {
        components.add(IncomeComponent(
          key: 'work',
          letter: letterFor(),
          name: '工作账本 · 进项',
          cents: B,
          sign: 1,
        ));
      }
      if (_ownTaoyuan != null) {
        components.add(IncomeComponent(
          key: 'taoyuan:cash',
          letter: letterFor(),
          name: '桃源 · 现金奖励',
          cents: C,
          sign: 1,
        ));
        components.add(IncomeComponent(
          key: 'taoyuan:jd',
          letter: letterFor(),
          name: '桃源 · 京东卡奖励',
          cents: D,
          sign: 1,
        ));
      }
      for (final l in generalLedgers) {
        final cum = await GeneralEntryDao().cumulativeTotals(l.id);
        components.add(IncomeComponent(
          key: 'general:${l.id}',
          letter: letterFor(),
          name: '${l.displayName} · 进项',
          cents: cum.income,
          sign: 1,
        ));
      }
      for (final l in generalLedgers) {
        final cum = await GeneralEntryDao().cumulativeTotals(l.id);
        components.add(IncomeComponent(
          key: 'general-expense:${l.id}',
          letter: letterFor(),
          name: '${l.displayName} · 出项',
          cents: cum.expense,
          sign: -1,
        ));
      }
      for (final l in travelLedgers) {
        final spent = await _travelCumulative(l.id);
        components.add(IncomeComponent(
          key: 'travel-expense:${l.id}',
          letter: letterFor(),
          name: '${l.displayName} · 出项',
          cents: spent,
          sign: -1,
        ));
      }

      // ---- 工作出项汇总（累计） ----
      if (_ownWork != null) {
        _workExpenseTotal =
            (await WorkEntryDao().cumulativeTotals(_ownWork!.id)).expense;
      }

      // ---- 超支检测（分类预算 月+周） ----
      final now = DateTime.now();
      final monthStart = DateTime(now.year, now.month, 1).millisecondsSinceEpoch;
      final monthEnd =
          DateTime(now.year, now.month + 1, 1).millisecondsSinceEpoch;
      final daysSinceMonday = now.weekday - 1;
      final weekStart = DateTime(now.year, now.month, now.day - daysSinceMonday)
          .millisecondsSinceEpoch;
      final weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;

      final overByLedger = <String, OverLedger>{};
      final overCountMap = <String, int>{};
      for (final l in generalLedgers) {
        final custom = CustomCategories.parse(l.customCategories);
        if (custom.budgets.isEmpty && custom.budgetsWeekly.isEmpty) continue;
        final monthSpend =
            await GeneralEntryDao().categorySpend(l.id, monthStart, monthEnd);
        final weekSpend =
            await GeneralEntryDao().categorySpend(l.id, weekStart, weekEnd);
        var overCount = 0;
        for (final e in custom.budgets.entries) {
          if ((monthSpend[e.key] ?? 0) > e.value) overCount += 1;
        }
        for (final e in custom.budgetsWeekly.entries) {
          if ((weekSpend[e.key] ?? 0) > e.value) overCount += 1;
        }
        if (overCount > 0) {
          overByLedger[l.id] = OverLedger(
            ledgerId: l.id,
            ledgerName: l.displayName,
            overCount: overCount,
          );
          overCountMap[l.id] = overCount;
        }
      }

      // ---- 普通/旅游账本卡片（本月口径） ----
      final ym = '${now.year}-${now.month.toString().padLeft(2, '0')}';
      final cards = <_HomeLedgerCard>[];
      for (final l in generalLedgers) {
        final t = await GeneralEntryDao().monthlyTotals(l.id, ym);
        var summary =
            '本月支出 ${money.Money.formatPlain(t.expense)} · 收入 ${money.Money.formatPlain(t.income)}';
        if (l.budgetCents != null && l.budgetCents! > 0) {
          summary +=
              ' · 预算 ${((t.expense / l.budgetCents!) * 100).round()}%';
        }
        cards.add(_HomeLedgerCard(
          ledger: l,
          summary: summary,
          overCount: overCountMap[l.id] ?? 0,
        ));
      }
      for (final l in travelLedgers) {
        final members = await TripDao().listMembers(l.id);
        final expenses = await TripDao().listExpenses(l.id);
        var spent = 0;
        for (final e in expenses) {
          if (e.deletedAt == null) spent += e.amountBaseCents;
        }
        cards.add(_HomeLedgerCard(
          ledger: l,
          summary: '${members.length} 人 · 已花 '
              '${money.Money.formatPlain(spent)} ${l.baseCurrency ?? ''}',
        ));
      }

      if (!mounted) return;
      setState(() {
        _components = components;
        _overLedgers = overByLedger.values.toList();
        _ledgerCards = cards;
        _sharedWorkLedgers = sharedWorkLedgers;
        _sharedTaoyuanLedgers = sharedTaoyuanLedgers;
        _sharedWorkCount = sharedWorkCount;
        _sharedTaoyuanCount = sharedTaoyuanCount;
      });
    } catch (_) {
      // 汇总失败仅静默，保留已有 UI。
    }
  }

  Future<int> _travelCumulative(String ledgerId) async {
    final expenses = await TripDao().listExpenses(ledgerId);
    var spent = 0;
    for (final e in expenses) {
      if (e.deletedAt == null) spent += e.amountBaseCents;
    }
    return spent;
  }

  /// 从同类型账本列表中挑选"我的"那一本：优先 isOwn==true；若都无标记
  /// （本地新建尚未同步），兜底取第一本，避免自家账本被误判为共享 [#3]。
  Ledger? _pickOwn(List<Ledger> list) {
    final owned = list.where((l) => l.isOwn == true).toList();
    if (owned.isNotEmpty) return owned.first;
    return list.isNotEmpty ? list.first : null;
  }

  void _openLedger(Ledger ledger) {
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => pageForLedger(ledger)));
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final listState = context.watch<LedgerListState>();
    final ledgers = listState.all;
    final syncing = listState.syncing;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final byId = {for (final l in ledgers) l.id: l};

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ---- 头部：用户名 + 退出 + 悬浮工具条 ----
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                          '${auth.username ?? ''} · 心愿便利贴${syncing ? ' · 同步中…' : ''}',
                          style: TextStyle(color: ink500, fontSize: 14)),
                      const SizedBox(height: 8),
                      GestureDetector(
                        onTap: () async {
                          context.read<LedgerListState>().resetSync();
                          await context.read<AuthState>().logout();
                        },
                        child: Text('退出',
                            style: TextStyle(color: ink900, fontSize: 14)),
                      ),
                    ],
                  ),
                ),
                const FloatingToolbar(mode: ToolbarMode.home),
              ],
            ),

            // ---- 超支卡（仅超支时显示，对齐网页端守卫） ----
            if (_overLedgers.isNotEmpty) ...[
              const SizedBox(height: 12),
              OverspendCard(
                overLedgers: _overLedgers,
                onTap: (id) {
                  final l = byId[id];
                  if (l != null) _openLedger(l);
                },
              ),
            ],

            // ---- 总收入 A 卡 ----
            if (_components.isNotEmpty) ...[
              const SizedBox(height: 16),
              IncomeComponentsCard(
                components: _components,
                otherReward: _otherReward,
                countReward: _countReward,
                textReward: _textReward,
              ),
            ],

            // ---- 功能列表（对齐网页端卡片顺序；space-y-3=12 间距，首张无前导间距） ----
            ...() {
              final items = <Widget>[];
              void add(Widget w) {
                if (items.isNotEmpty) {
                  items.add(const SizedBox(height: 12));
                }
                items.add(w);
              }
              if (_ownWork != null) {
                add(LedgerFeatureCard(
                  icon: '💼',
                  title: _ownWork!.displayName,
                  subtitle: '按月记录进项与出项',
                  onTap: () => _openLedger(_ownWork!),
                ));
              }
              if (_ownWork != null) {
                add(LedgerFeatureCard(
                  icon: '',
                  title: '工作出项汇总',
                  subtitleWidget: Row(
                    children: [
                      Text('合计 ',
                          style: TextStyle(color: ink500, fontSize: 12)),
                      Money(
                        cents: _workExpenseTotal,
                        style: TextStyle(color: ink500, fontSize: 12),
                      ),
                    ],
                  ),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                        builder: (_) => const WorkSummaryPage()),
                  ),
                ));
              }
              if (_ownTaoyuan != null) {
                add(LedgerFeatureCard(
                  icon: '🌸',
                  title: _ownTaoyuan!.displayName,
                  subtitle: '活动发布 → 预测 → 公示 → 发钱',
                  badge: _pendingCount > 0 ? '$_pendingCount' : null,
                  onTap: () => _openLedger(_ownTaoyuan!),
                ));
              }
              for (final c in _ledgerCards) {
                add(LedgerFeatureCard(
                  icon: _kindIcon(c.ledger.kind),
                  title: c.ledger.displayName,
                  subtitle: c.summary,
                  badge: c.overCount > 0 ? '超支 ${c.overCount}' : null,
                  onTap: () => _openLedger(c.ledger),
                ));
              }
              // 共享 work/taoyuan 卡片（对齐网页端 ledgerCards 中 shared* 段，
              // 排在 general/travel 之后、周期记账之前）。
              for (final l in _sharedWorkLedgers) {
                final n = _sharedWorkCount[l.id] ?? 0;
                add(LedgerFeatureCard(
                  icon: l.icon ?? '💼',
                  title: l.displayName,
                  subtitle: '共享账本 · $n 条记录',
                  onTap: () => _openLedger(l),
                ));
              }
              for (final l in _sharedTaoyuanLedgers) {
                final n = _sharedTaoyuanCount[l.id] ?? 0;
                add(LedgerFeatureCard(
                  icon: l.icon ?? '🌸',
                  title: l.displayName,
                  subtitle: n > 0 ? '共享账本 · $n 个待处理活动' : '共享账本',
                  onTap: () => _openLedger(l),
                ));
              }
              add(LedgerFeatureCard(
                icon: '🔁',
                title: '周期记账',
                subtitle: '房租 · 订阅 · 工资，配一次自动记',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const RecurringPage()),
                ),
              ));
              add(LedgerFeatureCard(
                icon: '💳',
                title: '银行卡备份',
                subtitle: '加密存储卡号 · 查看需验密码',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const BankPage()),
                ),
              ));
              add(LedgerFeatureCard(
                icon: '📈',
                title: '统计',
                subtitle: '月度趋势 · 类别占比 · 环比同比',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const StatsPage()),
                ),
              ));
              add(LedgerFeatureCard(
                icon: '🔍',
                title: '搜索',
                subtitle: '跨账本按关键字 · 金额 · 时间 · 类别查找',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const SearchPage()),
                ),
              ));
              add(_AddLedgerCard(
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                      builder: (_) => const ManageLedgersPage()),
                ),
              ));
              add(LedgerFeatureCard(
                icon: '🗑️',
                title: '回收站',
                subtitle: '删除的记录 · 60 天内可恢复',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const TrashPage()),
                ),
              ));
              add(LedgerFeatureCard(
                icon: '',
                title: '导出备份',
                subtitle: '全部账本 · CSV 查看 / JSON 完整还原',
                onTap: () => showExportSheet(context),
              ));
              add(LedgerFeatureCard(
                icon: '',
                title: '导入还原',
                subtitle: '从完整备份 JSON 恢复数据',
                onTap: () => showImportSheet(context, onImported: () async {
                  await context.read<LedgerListState>().load();
                  await _loadSummary();
                }),
              ));
              add(LedgerFeatureCard(
                icon: '',
                title: '修改密码',
                subtitle: '改完会让其它设备重新登录',
                onTap: () => showChangePasswordSheet(context),
              ));
              add(LedgerFeatureCard(
                icon: '',
                title: '使用引导',
                subtitle: '功能速览 · 新手第一步',
                onTap: () => OnboardingGuide.show(context),
              ));
              if (auth.role == 'admin') {
                add(LedgerFeatureCard(
                  icon: '',
                  title: '用户管理',
                  subtitle: '管理员专属：新增/删除/重置用户',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const UsersPage()),
                  ),
                ));
              }
              return [const SizedBox(height: 32), Column(children: items)];
            }(),
          ],
        ),
      ),
    );
  }

  String _kindIcon(String kind) {
    switch (kind) {
      case AppConfig.kindWork:
        return '💼';
      case AppConfig.kindTaoyuan:
        return '🌸';
      case AppConfig.kindTravel:
        return '✈️';
      default:
        return '📒';
    }
  }
}

/// 「添加 / 删除账本」卡片：surfaceSubtle 底 + 虚线 2px 描边（对齐网页端 border-2 border-dashed）。
class _AddLedgerCard extends StatelessWidget {
  final VoidCallback? onTap;
  const _AddLedgerCard({this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final dashed =
        isDark ? AppColors.darkBorder : AppColors.lightBorderDashed;
    final fill = isDark ? AppColors.darkSurface : AppColors.lightSurfaceSubtle;

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: dashed, width: 2),
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
                      style: TextStyle(color: ink900, fontSize: 18)),
                  const SizedBox(height: 2),
                  Text('新增账本 · 恢复回收站 · 管理已有',
                      style: TextStyle(color: ink500, fontSize: 12)),
                ],
              ),
            ),
            Text('›', style: TextStyle(color: ink400, fontSize: 20)),
          ],
        ),
      ),
    );
  }
}
