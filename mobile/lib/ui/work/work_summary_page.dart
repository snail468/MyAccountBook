import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/constants.dart';
import '../../data/local/work_entry_dao.dart';
import '../../data/models/ledger.dart';
import '../../state/ledger_list_state.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/money.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';
import 'work_ledger_page.dart';
import 'work_expenses_page.dart';

/// 工作账本·多月总览（对齐网页 /work：work/page.tsx + WorkMonthsSection）。
///
/// 聚合所有工作账本的按月垫款/回款，按月份合并后展示：
///   · 顶部累计汇总：进项合计 / 出项合计 / 结余 / 回款率（= 进项/出项）。
///   · 月份列表（最近 12 个月或自最早记录月起）：每张卡显示 进项/出项/结余，
///     点击进入对应月份的 [WorkLedgerPage]。
class WorkSummaryPage extends StatefulWidget {
  /// 进入时传入的账本（own 或协同共享）。用于详情页标题显示 owner 前缀；
  /// 为 null 时（旧调用）回退到中性标题「工作账本」。[#1 协同账本 owner 前缀]
  final Ledger? ledger;

  const WorkSummaryPage({super.key, this.ledger});

  @override
  State<WorkSummaryPage> createState() => _WorkSummaryPageState();
}

class _WorkSummaryPageState extends State<WorkSummaryPage> {
  /// 合并后的按月汇总；键为 'YYYY-MM'，值为 (income, expense)。
  Map<String, ({int income, int expense})> _byMonth = {};

  /// 参与聚合的工作账本（用于点击进入单月页）。
  List<Ledger> _workLedgers = [];

  /// 累计进项 / 出项。
  int _totalIncome = 0;
  int _totalExpense = 0;

  /// 是否正在加载。
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    // 即点即开：initState 中立即启动加载，数据就绪后首帧即刷新，
    // 避免 postFrame 导致的额外一帧空白。[#4]
    _load();
  }

  /// 加载并合并所有工作账本的按月汇总（复用 [WorkEntryDao.totalsByMonth]）。
  Future<void> _load() async {
    try {
      final state = context.read<LedgerListState>();
      await state.load();
      final ledgers = state.byKind(AppConfig.kindWork);

      // 并行查询各工作账本，减少首屏等待。
      final monthlyList = await Future.wait(
        ledgers.map((l) => WorkEntryDao().totalsByMonth(l.id)),
      );

      final merged = <String, ({int income, int expense})>{};
      for (final monthly in monthlyList) {
        monthly.forEach((ym, totals) {
          final cur = merged[ym] ?? (income: 0, expense: 0);
          merged[ym] = (
            income: cur.income + totals.income,
            expense: cur.expense + totals.expense,
          );
        });
      }

      int ti = 0;
      int te = 0;
      for (final t in merged.values) {
        ti += t.income;
        te += t.expense;
      }

      if (!mounted) return;
      setState(() {
        _byMonth = merged;
        _workLedgers = ledgers;
        _totalIncome = ti;
        _totalExpense = te;
        _loading = false;
      });
    } catch (_) {
      // 异常：保持空数据，仅结束 loading，不崩溃。
      if (mounted) setState(() => _loading = false);
    }
  }

  /// 下拉刷新：强制全量重新同步（清空增量水线 → 全量对账），把服务端有、
  /// 但本地因历史同步抖动而缺失的历史行（如 8 月）补回来，再重载汇总。[Bug2]
  Future<void> _onRefresh() async {
    try {
      await context.read<LedgerListState>().forceSync();
    } catch (_) {
      // 同步失败：保留已渲染的本地缓存数据，不阻断刷新手势。
    }
    if (mounted) await _load();
  }

  /// 生成月份列表（对齐网页 makeMonthList）：当前月往前 11 个月，
  /// 若最早记录更早则从最早月开始；倒序（最新在前）。
  /// 使用 DateTime 做月份递增，让 Dart 自动处理跨年，避免边界月计算出错。
  List<String> _monthList() {
    final now = DateTime.now();
    final current = DateTime(now.year, now.month, 1);

    // 默认展示最近 12 个月（含当前月）
    var start = DateTime(now.year, now.month - 11, 1);

    // 若最早记录更早，则追溯到最早月
    if (_byMonth.isNotEmpty) {
      final earliest = _byMonth.keys.reduce((a, b) => a.compareTo(b) < 0 ? a : b);
      final parts = earliest.split('-');
      final em = DateTime(int.parse(parts[0]), int.parse(parts[1]), 1);
      if (em.isBefore(start)) start = em;
    }

    final months = <String>[];
    var d = start;
    while (!d.isAfter(current)) {
      months.add('${d.year}-${d.month.toString().padLeft(2, '0')}');
      d = DateTime(d.year, d.month + 1, 1);
    }
    return months.reversed.toList();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;

    final balance = _totalIncome - _totalExpense;
    final rate = _totalExpense > 0
        ? (_totalIncome / _totalExpense * 100).round()
        : (_totalIncome > 0 ? 100 : 0);

    final now = DateTime.now();
    final currentMonth =
        '${now.year}-${now.month.toString().padLeft(2, '0')}';
    final months = _monthList();

    return Scaffold(
      backgroundColor: pageBg,
      body: SafeArea(
        top: false,
        child: RefreshIndicator(
          onRefresh: _onRefresh,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PageHeader(
                icon: '💼',
                title: widget.ledger?.displayName ?? '工作账本',
                subtitle: '按月记录进项与出项',
              ),

              // ---- 出项汇总（回款管理，对齐网页 /work/expenses）----
              GestureDetector(
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const WorkExpensesPage()),
                ),
                child: AppCard(
                  radius: 24,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('出项汇总',
                                  style: TextStyle(
                                      color: ink900,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w600)),
                              const SizedBox(height: 4),
                              Text('应收出项 · 回款进度 · 批量回款',
                                  style: TextStyle(color: ink500, fontSize: 12)),
                            ],
                          ),
                        ),
                        Icon(Icons.chevron_right, color: ink400),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // ---- 累计汇总 ----
              AppCard(
                radius: 24,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('累计',
                          style: TextStyle(color: ink500, fontSize: 12)),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: _Stat(
                              label: '进项',
                              cents: _totalIncome,
                              sign: true,
                              color: green,
                            ),
                          ),
                          Expanded(
                            child: _Stat(
                              label: '出项',
                              cents: -_totalExpense,
                              sign: true,
                              color: red,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: _Stat(
                              label: '结余',
                              cents: balance,
                              sign: true,
                              color: balance >= 0 ? green : red,
                            ),
                          ),
                          Expanded(
                            child: _Stat(
                              label: '回款率',
                              text: _totalExpense > 0 ? '$rate%' : '—',
                              color: ink900,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),

              SectionLabel('按月查看'),

              if (_loading)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('加载中…',
                      style: TextStyle(color: ink500, fontSize: 13)),
                )
              else if (months.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('还没有工作账本记录',
                      style: TextStyle(color: ink500, fontSize: 13)),
                )
              else
                ...months.map((ym) {
                  final totals = _byMonth[ym] ?? (income: 0, expense: 0);
                  final mIncome = totals.income;
                  final mExpense = totals.expense;
                  final mBalance = mIncome - mExpense;
                  final hasData = mIncome + mExpense > 0;
                  final parts = ym.split('-');
                  final y = parts[0];
                  final m = int.parse(parts[1]);
                  final isCurrent = ym == currentMonth;

                  final cardBg = isCurrent
                      ? (isDark ? AppColors.darkInk100 : AppColors.lightInk900)
                      : surface;
                  final fg = isCurrent
                      ? (isDark ? AppColors.darkPageBg : Colors.white)
                      : ink900;
                  final fgSoft = isCurrent
                      ? (isDark ? AppColors.darkPageBg : Colors.white)
                          .withOpacity(0.7)
                      : ink500;

                  final ledgerForMonth =
                      _workLedgers.isNotEmpty ? _workLedgers.first : null;

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: AppCard(
                      radius: 24,
                      color: cardBg,
                      onTap: ledgerForMonth == null
                          ? null
                          : () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => WorkLedgerPage(
                                    ledger: ledgerForMonth!,
                                    month: ym,
                                  ),
                                ),
                              ),
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('$y 年',
                                        style: TextStyle(
                                            color: fgSoft, fontSize: 12)),
                                    const SizedBox(height: 2),
                                    Text('$m 月',
                                        style: TextStyle(
                                            color: fg,
                                            fontSize: 28,
                                            fontWeight: FontWeight.w600)),
                                  ],
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Money(
                                      cents: mIncome,
                                      style: TextStyle(
                                          color: fg,
                                          fontSize: 22,
                                          fontWeight: FontWeight.w600),
                                    ),
                                    const SizedBox(height: 4),
                                    if (!hasData)
                                      Text('点击记账',
                                          style: TextStyle(
                                              color: fgSoft, fontSize: 12)),
                                  ],
                                ),
                              ],
                            ),
                            if (hasData)
                              Padding(
                                padding: const EdgeInsets.only(top: 10),
                                child: Row(
                                  children: [
                                    Text('进 ',
                                        style: TextStyle(
                                            color: fgSoft, fontSize: 12)),
                                    Money(
                                        cents: mIncome,
                                        style: TextStyle(
                                            color: fgSoft, fontSize: 12)),
                                    const SizedBox(width: 16),
                                    Text('出 ',
                                        style: TextStyle(
                                            color: fgSoft, fontSize: 12)),
                                    Money(
                                        cents: mExpense,
                                        style: TextStyle(
                                            color: fgSoft, fontSize: 12)),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  );
                }              ),
            ],
          ),
        ),
        ),
      ),
    );
  }
}

/// 汇总小块（标签 + 金额 / 文本）。
class _Stat extends StatelessWidget {
  final String label;
  final int cents;
  final String? text;
  final bool sign;
  final Color color;

  const _Stat({
    required this.label,
    this.cents = 0,
    this.text,
    this.sign = false,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: ink500, fontSize: 12)),
        const SizedBox(height: 4),
        text != null
            ? Text(text!,
                style: TextStyle(
                    color: color, fontSize: 18, fontWeight: FontWeight.w600))
            : Money(
                cents: cents,
                sign: sign,
                style: TextStyle(
                    color: color, fontSize: 18, fontWeight: FontWeight.w600),
              ),
      ],
    );
  }
}
