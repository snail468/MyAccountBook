import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/constants.dart';
import '../../core/money.dart' as money;
import '../../core/refund_status.dart';
import '../../data/local/work_entry_dao.dart';
import '../../data/models/ledger.dart';
import '../../data/models/work_entry.dart';
import '../../state/ledger_list_state.dart';
import '../../state/work_state.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/money.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';

/// 工作出项汇总页（对齐网页 /work/expenses：WorkExpensesSection + ExpenseList）。
///
/// 聚合所有工作账本的出项（外支出/应收），单次遍历派生出全部汇总量
/// （total / refunded / byCategory / overdue），保证各派生量之间算术一致：
///   · 逾期提醒（逾期提醒）：超 [refundOverdueDays] 天的未回款高亮。
///   · 全部出项 + 已回款/未回款拆分 + 回款进度条（回款进度）。
///   · 按分类累计（按分类）：每类一条进度条。
///   · 明细列表（按月份分组）+ 批量回款（批量回款）选择模式。
///
/// 顶部汇总与每行红标共用同一次加载时算出的 `asOf` 时间戳，避免漂移。
class WorkExpensesPage extends StatefulWidget {
  const WorkExpensesPage({super.key});

  @override
  State<WorkExpensesPage> createState() => _WorkExpensesPageState();
}

/// 单类别累计（对齐网页 CategoryStat）。
class _CategoryStat {
  final String category;
  final int totalCents;
  final int count;
  final int refundedCents;
  final int pendingCents;
  final int refundedCount;
  final int pendingCount;
  const _CategoryStat({
    required this.category,
    required this.totalCents,
    required this.count,
    required this.refundedCents,
    required this.pendingCents,
    required this.refundedCount,
    required this.pendingCount,
  });
}

class _WorkExpensesPageState extends State<WorkExpensesPage> {
  List<WorkEntry> _expenses = []; // 全部出项，occurredAt 倒序
  List<Ledger> _ledgers = [];
  int _total = 0;
  int _refundedTotal = 0;
  int _refundedCount = 0;
  int _overdueCount = 0;
  int _overdueTotalCents = 0;
  int _overdueOldestDays = 0;
  List<_CategoryStat> _categoryStats = [];
  Map<String, List<WorkEntry>> _byMonth = {};
  DateTime _asOf = DateTime.now();
  bool _loading = true;

  // 批量回款：选择模式 + 已选 id 集合。
  bool _selecting = false;
  final Set<String> _selectedIds = {};
  bool _submitting = false;

  /// ledgerId -> WorkState（批量回款时按条目所属账本调用 refundEntry）。
  final Map<String, WorkState> _states = {};

  @override
  void initState() {
    super.initState();
    // 即点即开：initState 中立即启动加载，减少空白帧。[#4]
    _load();
  }

  WorkState _stateFor(String ledgerId) {
    return _states.putIfAbsent(ledgerId, () {
      final ledger = _ledgers.firstWhere((l) => l.id == ledgerId);
      return WorkState(ledger);
    });
  }

  /// 加载并聚合所有工作账本的出项（复用 [WorkEntryDao.listByLedger]）。
  Future<void> _load() async {
    try {
      final lstate = context.read<LedgerListState>();
      await lstate.load();
      _ledgers = lstate.byKind(AppConfig.kindWork);

      final all = <WorkEntry>[];
      final rowsList = await Future.wait(
        _ledgers.map((l) => WorkEntryDao().listByLedger(l.id)),
      );
      for (final rows in rowsList) {
        for (final e in rows) {
          if (e.direction == 'expense') all.add(e);
        }
      }
      all.sort((a, b) => b.occurredAt.compareTo(a.occurredAt));

      final now = DateTime.now();
      int total = 0;
      int refundedTotal = 0;
      int refundedCount = 0;
      int overdueCount = 0;
      int overdueTotalCents = 0;
      int overdueOldestDays = 0;
      final catMap = <String, _CategoryStat>{};
      final byMonth = <String, List<WorkEntry>>{};

      for (final e in all) {
        total += e.amountCents;
        final occurred = DateTime.fromMillisecondsSinceEpoch(e.occurredAt);
        final refunded = e.refundedAt == null
            ? null
            : DateTime.fromMillisecondsSinceEpoch(e.refundedAt!);
        final isRefunded = e.refundedAt != null;

        if (isRefunded) {
          refundedTotal += e.amountCents;
          refundedCount += 1;
        } else if (refundStatus(occurred, e.yearMonth,
                refundedAt: refunded, now: now) ==
            RefundState.overdue) {
          overdueCount += 1;
          overdueTotalCents += e.amountCents;
          final ageDays = daysSincePending(occurred, e.yearMonth,
              refundedAt: refunded, now: now);
          if (ageDays > overdueOldestDays) overdueOldestDays = ageDays;
        }

        final c = catMap[e.category] ??
            const _CategoryStat(
                category: '',
                totalCents: 0,
                count: 0,
                refundedCents: 0,
                pendingCents: 0,
                refundedCount: 0,
                pendingCount: 0);
        catMap[e.category] = _CategoryStat(
          category: e.category,
          totalCents: c.totalCents + e.amountCents,
          count: c.count + 1,
          refundedCents: c.refundedCents + (isRefunded ? e.amountCents : 0),
          pendingCents: c.pendingCents + (isRefunded ? 0 : e.amountCents),
          refundedCount: c.refundedCount + (isRefunded ? 1 : 0),
          pendingCount: c.pendingCount + (isRefunded ? 0 : 1),
        );

        (byMonth[e.yearMonth] ??= []).add(e);
      }

      final categoryStats = catMap.values.toList()
        ..sort((a, b) => b.totalCents.compareTo(a.totalCents));

      if (!mounted) return;
      setState(() {
        _expenses = all;
        _total = total;
        _refundedTotal = refundedTotal;
        _refundedCount = refundedCount;
        _overdueCount = overdueCount;
        _overdueTotalCents = overdueTotalCents;
        _overdueOldestDays = overdueOldestDays;
        _categoryStats = categoryStats;
        _byMonth = byMonth;
        _asOf = now;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  int get _selectedTotal {
    var sum = 0;
    for (final e in _expenses) {
      if (_selectedIds.contains(e.id)) sum += e.amountCents;
    }
    return sum;
  }

  bool get _anyPending => _expenses.any((e) => e.refundedAt == null);

  void _toggleSelect(String id) {
    setState(() {
      if (_selectedIds.contains(id)) {
        _selectedIds.remove(id);
      } else {
        _selectedIds.add(id);
      }
    });
  }

  Future<void> _batchRefund() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('批量标为已回款？'),
        content: Text(
            '已选 ${_selectedIds.length} 笔 · 合计 ${money.Money.formatPlain(_selectedTotal)} 元。'
            '回款时间会写成"现在"。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('标记回款'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    setState(() => _submitting = true);
    try {
      final now = DateTime.now().millisecondsSinceEpoch;
      for (final e in _expenses) {
        if (_selectedIds.contains(e.id) && e.refundedAt == null) {
          await _stateFor(e.ledgerId).refundEntry(e, now);
        }
      }
      setState(() {
        _selecting = false;
        _selectedIds.clear();
      });
      await _load();
    } catch (_) {
      if (mounted) setState(() => _submitting = false);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
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
    final subBg = isDark ? AppColors.darkPageBg : AppColors.lightInk100;
    final warnBg = isDark ? AppColors.darkSurface : AppColors.lightOverspendBg;
    final warnBorder =
        isDark ? AppColors.darkBorder : AppColors.lightOverspendBorder;
    final warnFg =
        isDark ? AppColors.darkSemanticRed : AppColors.lightOverspendTitle;
    final warnSub =
        isDark ? AppColors.darkInk400 : AppColors.lightOverspendDetail;
    final checkColor =
        isDark ? AppColors.darkPageBg : AppColors.lightSurface;

    final refundPct =
        _total > 0 ? (_refundedTotal / _total * 100).round() : 0;

    return Scaffold(
      backgroundColor: pageBg,
      body: SafeArea(
        top: false,
        child: Stack(
          children: [
            SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                24,
                56,
                24,
                _selecting && _selectedIds.isNotEmpty ? 104 : 24,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const PageHeader(
                    icon: '💸',
                    title: '工作出项汇总',
                    subtitle: '应收垫款与回款进度',
                  ),

                  if (_loading)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text('加载中…',
                          style: TextStyle(color: ink500, fontSize: 13)),
                    )
                  else if (_expenses.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text('还没有出项',
                          style: TextStyle(color: ink500, fontSize: 13)),
                    )
                  else
                    ..._body(
                      ink900,
                      ink500,
                      ink400,
                      surface,
                      border,
                      red,
                      green,
                      subBg,
                      warnBg,
                      warnBorder,
                      warnFg,
                      warnSub,
                      checkColor,
                      refundPct,
                    ),

                  const SizedBox(height: 24),
                ],
              ),
            ),

            // 批量回款底部条 —— 有选中就浮出。
            if (_selecting && _selectedIds.isNotEmpty)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
                  decoration: BoxDecoration(
                    color: surface,
                    border: Border(top: BorderSide(color: border, width: 1)),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('已选 ${_selectedIds.length} 笔 · 合计',
                                style: TextStyle(color: ink500, fontSize: 12)),
                            Money(
                              cents: _selectedTotal,
                              style: TextStyle(
                                  color: ink900,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      SizedBox(
                        height: 48,
                        child: ElevatedButton(
                          onPressed: _submitting ? null : _batchRefund,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: green,
                            foregroundColor: checkColor,
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                          child: Text(_submitting ? '标记中…' : '标为已回款',
                              style: const TextStyle(
                                  fontSize: 15, fontWeight: FontWeight.w600)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  List<Widget> _body(
    Color ink900,
    Color ink500,
    Color ink400,
    Color surface,
    Color border,
    Color red,
    Color green,
    Color subBg,
    Color warnBg,
    Color warnBorder,
    Color warnFg,
    Color warnSub,
    Color checkColor,
    int refundPct,
  ) {
    final children = <Widget>[];

    // ---- 逾期提醒 ----
    if (_overdueCount > 0) {
      children.add(
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: warnBg,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: warnBorder, width: 1),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('⚠️ $_overdueCount 笔未回款已超 $refundOverdueDays 天',
                  style: TextStyle(
                      color: warnFg, fontSize: 13, fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text('合计 ',
                      style: TextStyle(color: warnSub, fontSize: 13)),
                  Money(
                    cents: _overdueTotalCents,
                    style: TextStyle(
                        color: warnFg, fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  if (_overdueOldestDays > refundOverdueDays) ...<Widget>[
                    const SizedBox(width: 8),
                    Text('· 最久 $_overdueOldestDays 天',
                        style: TextStyle(color: warnSub, fontSize: 11)),
                  ],
                ],
              ),
              const SizedBox(height: 6),
              Text('下方列表中已标红，回款后到月页面把它标为「已回款」即可。',
                  style: TextStyle(color: warnSub, fontSize: 11)),
            ],
          ),
        ),
      );
    }

    // ---- 全部出项 + 已/未回款 + 进度条 ----
    children.add(
      AppCard(
        radius: 24,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('全部出项 (元) · ${_expenses.length} 笔',
                  style: TextStyle(color: ink500, fontSize: 12)),
              const SizedBox(height: 4),
              Money(
                cents: _total,
                style: TextStyle(
                    color: ink900, fontSize: 30, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: subBg,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('已回款 · $_refundedCount 笔',
                              style: TextStyle(color: ink500, fontSize: 12)),
                          const SizedBox(height: 2),
                          Money(
                            cents: _refundedTotal,
                            style: TextStyle(
                                color: green,
                                fontSize: 15,
                                fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: subBg,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('未回款 · ${_expenses.length - _refundedCount} 笔',
                              style: TextStyle(color: ink500, fontSize: 12)),
                          const SizedBox(height: 2),
                          Money(
                            cents: _total - _refundedTotal,
                            style: TextStyle(
                                color: red,
                                fontSize: 15,
                                fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              if (_total > 0) ...<Widget>[
                const SizedBox(height: 12),
                _ProgressBar(
                  fraction: _refundedTotal / _total,
                  fill: green,
                  track: subBg,
                  height: 8,
                ),
                const SizedBox(height: 4),
                Text('回款进度 $refundPct%',
                    style: TextStyle(color: ink400, fontSize: 10)),
              ],
            ],
          ),
        ),
      ),
    );

    // ---- 按分类累计 ----
    if (_categoryStats.isNotEmpty) {
      children.add(const SectionLabel('按类别累计'));
      for (final c in _categoryStats) {
        final pctOfTotal =
            _total > 0 ? (c.totalCents / _total * 100).round() : 0;
        final cleared = c.pendingCents <= 0;
        children.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: AppCard(
              radius: 16,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Expanded(
                          child: Text(c.category,
                              style: TextStyle(
                                  color: ink900,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600)),
                        ),
                        const SizedBox(width: 8),
                        Text('${c.count} 笔 · 占 $pctOfTotal%',
                            style: TextStyle(color: ink400, fontSize: 10)),
                        const SizedBox(width: 12),
                        Money(
                          cents: c.totalCents,
                          style: TextStyle(
                              color: ink900,
                              fontSize: 16,
                              fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _ProgressBar(
                      fraction: c.totalCents > 0
                          ? c.refundedCents / c.totalCents
                          : 0,
                      fill: green,
                      track: subBg,
                      height: 6,
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '已回款 ${money.Money.formatPlain(c.refundedCents)} · ${c.refundedCount} 笔',
                          style: TextStyle(color: green, fontSize: 11),
                        ),
                        cleared
                            ? Text('已结清 ✓',
                                style: TextStyle(color: green, fontSize: 11))
                            : Text(
                                '未回款 ${money.Money.formatPlain(c.pendingCents)} · ${c.pendingCount} 笔',
                                style: TextStyle(color: red, fontSize: 11),
                              ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }
    }

    // ---- 明细 + 批量回款 ----
    children.add(const SectionLabel('明细'));
    if (_anyPending)
      children.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _selecting
              ? Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('已选 ${_selectedIds.length} 笔',
                        style: TextStyle(color: ink500, fontSize: 12)),
                    TextButton(
                      onPressed: () => setState(() {
                        _selecting = false;
                        _selectedIds.clear();
                      }),
                      child: Text('取消',
                          style: TextStyle(color: ink500, fontSize: 12)),
                    ),
                  ],
                )
              : Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => setState(() => _selecting = true),
                    child: Text('批量回款',
                        style: TextStyle(
                            color: ink500,
                            fontSize: 12,
                            decoration: TextDecoration.underline)),
                  ),
                ),
        ),
      );

    final months = _byMonth.keys.toList()..sort((a, b) => b.compareTo(a));
    for (final m in months) {
      final list = _byMonth[m]!;
      final sum = list.fold<int>(0, (acc, e) => acc + e.amountCents);
      final parts = m.split('-');
      final y = parts[0];
      final mo = int.parse(parts[1]);
      children.add(
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 6, left: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('$y 年 $mo 月',
                  style: TextStyle(
                      color: ink900, fontSize: 14, fontWeight: FontWeight.w500)),
              Money(
                cents: sum,
                style: TextStyle(color: ink500, fontSize: 12),
              ),
            ],
          ),
        ),
      );
      for (final e in list) {
        children.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _ExpenseRow(
              entry: e,
              asOf: _asOf,
              selecting: _selecting,
              selected: _selectedIds.contains(e.id),
              ink900: ink900,
              ink500: ink500,
              ink400: ink400,
              red: red,
              green: green,
              surface: surface,
              border: border,
              subBg: subBg,
              warnBg: warnBg,
              warnBorder: warnBorder,
              warnFg: warnFg,
              warnSub: warnSub,
              checkColor: checkColor,
              onToggleSelect: _selecting ? () => _toggleSelect(e.id) : null,
            ),
          ),
        );
      }
    }

    return children;
  }
}

/// 进度条（对齐网页 h-2 / h-1.5 圆角满宽条）。
class _ProgressBar extends StatelessWidget {
  final double fraction;
  final Color fill;
  final Color track;
  final double height;

  const _ProgressBar({
    required this.fraction,
    required this.fill,
    required this.track,
    this.height = 8,
  });

  @override
  Widget build(BuildContext context) {
    final clamped = fraction.isNaN ? 0.0 : fraction.clamp(0.0, 1.0);
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: track,
        borderRadius: BorderRadius.circular(999),
      ),
      child: FractionallySizedBox(
        alignment: Alignment.centerLeft,
        widthFactor: clamped,
        child: Container(
          decoration: BoxDecoration(
            color: fill,
            borderRadius: BorderRadius.circular(999),
          ),
        ),
      ),
    );
  }
}

/// 明细单行（对齐网页 ExpenseList 的行）。
class _ExpenseRow extends StatelessWidget {
  final WorkEntry entry;
  final DateTime asOf;
  final bool selecting;
  final bool selected;
  final VoidCallback? onToggleSelect;
  final Color ink900;
  final Color ink500;
  final Color ink400;
  final Color red;
  final Color green;
  final Color surface;
  final Color border;
  final Color subBg;
  final Color warnBg;
  final Color warnBorder;
  final Color warnFg;
  final Color warnSub;
  final Color checkColor;

  const _ExpenseRow({
    required this.entry,
    required this.asOf,
    required this.selecting,
    required this.selected,
    required this.ink900,
    required this.ink500,
    required this.ink400,
    required this.red,
    required this.green,
    required this.surface,
    required this.border,
    required this.subBg,
    required this.warnBg,
    required this.warnBorder,
    required this.warnFg,
    required this.warnSub,
    required this.checkColor,
    this.onToggleSelect,
  });

  @override
  Widget build(BuildContext context) {
    final occurred = DateTime.fromMillisecondsSinceEpoch(entry.occurredAt);
    final refundedAt = entry.refundedAt == null
        ? null
        : DateTime.fromMillisecondsSinceEpoch(entry.refundedAt!);
    final status = refundStatus(occurred, entry.yearMonth,
        refundedAt: refundedAt, now: asOf);
    final refunded = status == RefundState.refunded;
    final overdue = status == RefundState.overdue;
    final overdueDays = overdue
        ? daysSincePending(occurred, entry.yearMonth,
            refundedAt: refundedAt, now: asOf)
        : 0;

    final selectable = selecting && !refunded;
    final dateStr = DateFormat('yyyy-MM-dd HH:mm').format(occurred);

    final content = Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: selected
            ? subBg
            : (refunded ? subBg : (overdue ? warnBg : surface)),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: selected ? warnFg : (overdue ? warnBorder : border),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          if (selecting)
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: _Checkbox(
                selected: selected,
                enabled: selectable,
                color: warnFg,
                disabledColor: ink400,
                checkColor: checkColor,
              ),
            ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        entry.category,
                        style: TextStyle(
                          color: refunded ? ink400 : ink900,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    if (overdue)
                      Container(
                        margin: const EdgeInsets.only(left: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: warnBg,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: warnBorder, width: 1),
                        ),
                        child: Text('未回款 $overdueDays 天',
                            style: TextStyle(color: warnFg, fontSize: 10)),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(dateStr, style: TextStyle(color: ink500, fontSize: 11)),
                if (refunded && refundedAt != null)
                  Text('回款于 ${DateFormat('yyyy-MM-dd HH:mm').format(refundedAt)}',
                      style: TextStyle(color: green, fontSize: 11)),
                if (entry.note != null && entry.note!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      entry.note!,
                      style: TextStyle(
                        color: refunded ? ink400 : ink500,
                        fontSize: 12,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text('-',
              style: TextStyle(
                  color: refunded ? ink400 : red,
                  fontSize: 16,
                  fontWeight: FontWeight.w600)),
          Money(
            cents: entry.amountCents,
            style: TextStyle(
              color: refunded ? ink400 : red,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );

    if (selectable) {
      return InkWell(onTap: onToggleSelect, child: content);
    }
    return content;
  }
}

/// 选择模式下的圆形勾选框（对齐网页 ExpenseList 的选中圆点）。
class _Checkbox extends StatelessWidget {
  final bool selected;
  final bool enabled;
  final Color color;
  final Color disabledColor;
  final Color checkColor;

  const _Checkbox({
    required this.selected,
    required this.enabled,
    required this.color,
    required this.disabledColor,
    required this.checkColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: selected
              ? color
              : (enabled ? color : disabledColor),
          width: 2,
        ),
        color: selected ? color : null,
      ),
      child: selected
          ? Center(
              child: Text('✓',
                  style: TextStyle(color: checkColor, fontSize: 10)),
            )
          : null,
    );
  }
}
