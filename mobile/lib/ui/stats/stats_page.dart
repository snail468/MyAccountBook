import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../state/theme_state.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/money.dart';
import '../widgets/page_header.dart';
import 'stats_state.dart';

/// 统计页（1:1 对齐网页端 src/app/stats/page.tsx + TrendChart.tsx）。
///
/// 结构：顶部 3 张汇总卡（总收入 / 总支出 / 结余）→ 月度收支趋势双折线图
/// （可点选单月看明细）→ 环比 / 同比两张并排卡 → 月均支出卡 → 支出构成横向占比条。
///
/// 颜色语义（按任务约定的个人记账口径，非网页端股票涨跌色）：
///   收入增 / 支出减 = 绿；反 = 红；无对比基数 / 持平 = 灰(ink400)。
/// 趋势图收入线=绿、支出线=红（任务明确要求）。
class StatsPage extends StatelessWidget {
  const StatsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => StatsState()..load(),
      child: const _StatsBody(),
    );
  }
}

class _StatsBody extends StatelessWidget {
  const _StatsBody();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<StatsState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final green =
        isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;

    // 玻璃风格下透出全局渐变桌布（对齐 AppTheme.scaffoldBackground / AppCard 磨砂逻辑）。
    final style = context.watch<ThemeState>().style;
    final pageBgColor = style == AppStyle.glass ? Colors.transparent : pageBg;

    final hasData = state.trend.any((t) => t.income != 0 || t.expense != 0) ||
        state.categories.isNotEmpty;

    final activeMonths = state.trend
        .where((t) => t.income != 0 || t.expense != 0)
        .toList()
        .length;
    final totalExpense = state.trend.fold(0, (s, t) => s + t.expense);
    final avgMonthlyExpense =
        activeMonths > 0 ? (totalExpense / activeMonths).round() : 0;

    return Container(
      color: pageBgColor,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const PageHeader(
                icon: '📊',
                title: '统计',
                subtitle: '全部账本 · 最近 12 个月',
              ),
              if (!hasData)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 48),
                  child: Center(
                    child: Text(
                      '最近 12 个月还没有记录，记几笔之后这里就有内容了',
                      style: TextStyle(color: ink500, fontSize: 13),
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              else ...[
                // ---- 3 汇总卡 ----
                Row(
                  children: [
                    Expanded(
                      child: _SummaryCard(
                        label: '总收入',
                        cents: state.income,
                        color: ink900,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _SummaryCard(
                        label: '总支出',
                        cents: state.expense,
                        color: ink900,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _SummaryCard(
                        label: '结余',
                        cents: state.balance,
                        color: ink900,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // ---- 月度收支趋势 ----
                AppCard(
                  frosted: false,
                  radius: 24,
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('月度收支趋势',
                            style: TextStyle(
                                color: ink900,
                                fontSize: 14,
                                fontWeight: FontWeight.w500)),
                        const SizedBox(height: 12),
                        _TrendChart(
                          buckets: state.trend,
                          incomeColor: green,
                          expenseColor: red,
                          baselineColor: border,
                          ink900: ink900,
                          ink500: ink500,
                          ink400: ink400,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // ---- 环比 / 同比（两张并排）----
                Row(
                  children: [
                    Expanded(
                      child: _CompareCard(
                        title: '环比（vs 上月）',
                        ink500: ink500,
                        rows: [
                          _CompareRow(
                            label: '收入',
                            cur: state.curIncome,
                            prev: state.prevIncome,
                            isIncome: true,
                          ),
                          _CompareRow(
                            label: '支出',
                            cur: state.curExpense,
                            prev: state.prevExpense,
                            isIncome: false,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _CompareCard(
                        title: '同比（vs 去年同月）',
                        ink500: ink500,
                        emptyHint: state.hasYoy ? null : '还没满一年',
                        rows: [
                          _CompareRow(
                            label: '收入',
                            cur: state.curIncome,
                            prev: state.yoyIncome,
                            isIncome: true,
                          ),
                          _CompareRow(
                            label: '支出',
                            cur: state.curExpense,
                            prev: state.yoyExpense,
                            isIncome: false,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // ---- 月均支出 ----
                AppCard(
                  frosted: false,
                  radius: 24,
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('月均支出（只按有记录的月份摊）',
                            style: TextStyle(color: ink500, fontSize: 11)),
                        const SizedBox(height: 8),
                        Money(
                          cents: avgMonthlyExpense,
                          style: TextStyle(
                            color: ink900,
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // ---- 支出构成 ----
                if (state.categories.isNotEmpty) ...[
                  AppCard(
                    frosted: false,
                    radius: 24,
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: _CategoryBreakdown(
                        categories: state.categories,
                        ink900: ink900,
                        ink500: ink500,
                        fill: ink900,
                        track: isDark
                            ? AppColors.darkBorder
                            : AppColors.lightInk100,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // ---- 收入构成（网页端并列卡，仅在有收入类别时显示）----
                if (state.incomeCategories.isNotEmpty) ...[
                  AppCard(
                    frosted: false,
                    radius: 24,
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: _CategoryBreakdown(
                        categories: state.incomeCategories,
                        ink900: ink900,
                        ink500: ink500,
                        fill: ink900,
                        track: isDark
                            ? AppColors.darkBorder
                            : AppColors.lightInk100,
                      ),
                    ),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// 汇总小卡（总收入 / 总支出 / 结余）。
class _SummaryCard extends StatelessWidget {
  final String label;
  final int cents;
  final Color color;

  const _SummaryCard({
    required this.label,
    required this.cents,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return AppCard(
      frosted: false,
      radius: 24,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(color: ink500, fontSize: 11)),
            const SizedBox(height: 6),
            Money(
              cents: cents,
              style: TextStyle(
                color: color,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 环比 / 同比单卡（标题 + 收入/支出两行带色 delta）。
///
/// [emptyHint] 非空时（如同比「还没满一年」）替换掉两行明细，对齐网页端的条件渲染。
class _CompareCard extends StatelessWidget {
  final String title;
  final Color ink500;
  final List<_CompareRow> rows;
  final String? emptyHint;

  const _CompareCard({
    required this.title,
    required this.ink500,
    this.rows = const [],
    this.emptyHint,
  });

  @override
  Widget build(BuildContext context) {
    return AppCard(
      frosted: false,
      radius: 24,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: TextStyle(color: ink500, fontSize: 11)),
            const SizedBox(height: 8),
            if (emptyHint != null)
              Text(emptyHint!,
                  style: TextStyle(color: ink500, fontSize: 12))
            else
              ...rows,
          ],
        ),
      ),
    );
  }
}

/// 环比/同比单行：标签 + 着色变化率（↑/↓ x.x%）。
///
/// 颜色按个人记账语义：收入增加或支出减少 => 绿；反 => 红；
/// 无对比基数(上月/去年同期为 0)或持平 => 中性灰(ink400)。
class _CompareRow extends StatelessWidget {
  final String label;
  final int cur;
  final int prev;
  final bool isIncome;

  const _CompareRow({
    required this.label,
    required this.cur,
    required this.prev,
    required this.isIncome,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final green =
        isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    final hasBase = prev != 0;
    final diff = cur - prev;
    final up = diff > 0;
    final down = diff < 0;
    final good = isIncome ? up : down; // 收入增 / 支出减 = 好
    final color =
        !hasBase ? ink400 : (diff == 0 ? ink400 : (good ? green : red));
    final arrow = !hasBase ? '—' : (up ? '↑' : down ? '↓' : '—');
    final pctText = !hasBase
        ? '—'
        : '${diff >= 0 ? '+' : ''}${(diff / prev * 100).toStringAsFixed(1)}%';

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Text(label, style: TextStyle(color: ink500, fontSize: 12)),
          const Spacer(),
          Text('$arrow $pctText',
              style: TextStyle(
                  color: color, fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

/// 支出构成：横向占比条（按总额占比，1:1 对齐网页端 categoryShare 渲染）。
class _CategoryBreakdown extends StatelessWidget {
  final List<({String label, int cents})> categories;
  final Color ink900;
  final Color ink500;
  final Color fill;
  final Color track;

  const _CategoryBreakdown({
    required this.categories,
    required this.ink900,
    required this.ink500,
    required this.fill,
    required this.track,
  });

  @override
  Widget build(BuildContext context) {
    if (categories.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child:
              Text('暂无数据', style: TextStyle(color: ink500, fontSize: 13)),
        ),
      );
    }
    final total = categories.fold(0, (s, c) => s + c.cents);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('支出构成',
            style: TextStyle(
                color: ink900, fontSize: 14, fontWeight: FontWeight.w500)),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            final avail = constraints.maxWidth;
            return Column(
              children: categories.map((c) {
                final pct = total == 0 ? 0.0 : c.cents / total * 100;
                final ratio = (pct > 100 ? 100 : pct) / 100;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(c.label,
                                style: TextStyle(color: ink900, fontSize: 13),
                                overflow: TextOverflow.ellipsis),
                          ),
                          const SizedBox(width: 8),
                          Text.rich(
                            TextSpan(
                              style: TextStyle(color: ink500, fontSize: 12),
                              children: [
                                WidgetSpan(
                                  alignment: PlaceholderAlignment.middle,
                                  child: Money(
                                    cents: c.cents,
                                    style:
                                        TextStyle(color: ink500, fontSize: 12),
                                  ),
                                ),
                                TextSpan(text: ' · ${pct.toStringAsFixed(1)}%'),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Container(
                        height: 6,
                        width: avail,
                        decoration: BoxDecoration(
                          color: track,
                          borderRadius: BorderRadius.circular(3),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: avail * ratio,
                              height: 6,
                              decoration: BoxDecoration(
                                color: fill,
                                borderRadius: BorderRadius.circular(3),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            );
          },
        ),
      ],
    );
  }
}

/// 月度收支趋势图（双折线，可点选单月看明细，对齐网页端 TrendChart 交互）。
class _TrendChart extends StatefulWidget {
  final List<({String month, int income, int expense})> buckets;
  final Color incomeColor;
  final Color expenseColor;
  final Color baselineColor;
  final Color ink900;
  final Color ink500;
  final Color ink400;

  const _TrendChart({
    required this.buckets,
    required this.incomeColor,
    required this.expenseColor,
    required this.baselineColor,
    required this.ink900,
    required this.ink500,
    required this.ink400,
  });

  @override
  State<_TrendChart> createState() => _TrendChartState();
}

class _TrendChartState extends State<_TrendChart> {
  int? _active;

  @override
  Widget build(BuildContext context) {
    final buckets = widget.buckets;
    final income = buckets.map((b) => b.income).toList();
    final expense = buckets.map((b) => b.expense).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 图例
        Row(
          children: [
            _legendItem(widget.incomeColor, '收入'),
            const SizedBox(width: 16),
            _legendItem(widget.expenseColor, '支出'),
          ],
        ),
        const SizedBox(height: 12),
        if (buckets.isEmpty)
          SizedBox(
            height: 160,
            child: Center(
              child: Text('暂无数据',
                  style: TextStyle(color: widget.ink500, fontSize: 13)),
            ),
          )
        else
          LayoutBuilder(
            builder: (context, constraints) {
              final w = constraints.maxWidth;
              const h = 160.0;
              return SizedBox(
                height: h,
                width: w,
                child: Stack(
                  children: [
                    CustomPaint(
                      size: Size(w, h),
                      painter: _TrendPainter(
                        income: income,
                        expense: expense,
                        incomeColor: widget.incomeColor,
                        expenseColor: widget.expenseColor,
                        baselineColor: widget.baselineColor,
                        active: _active,
                      ),
                    ),
                    // 整列可点：比只点线上 2px 圆点好按（手机上尤其）。
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        for (var i = 0; i < buckets.length; i++)
                          Expanded(
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: () => setState(
                                  () => _active = _active == i ? null : i),
                              child: Container(
                                  width: double.infinity, height: double.infinity),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        if (buckets.isNotEmpty) ...[
          const SizedBox(height: 4),
          // 只标首/中/尾三个月，避免标签挤成一团。
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(buckets.first.month.substring(2),
                  style: TextStyle(color: widget.ink400, fontSize: 10)),
              if (buckets.length > 2)
                Text(buckets[buckets.length ~/ 2].month.substring(2),
                    style: TextStyle(color: widget.ink400, fontSize: 10)),
              Text(buckets.last.month.substring(2),
                  style: TextStyle(color: widget.ink400, fontSize: 10)),
            ],
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 20,
            child: _active != null && _active! < buckets.length
                ? Text.rich(
                    TextSpan(
                      style: TextStyle(color: widget.ink500, fontSize: 12),
                      children: [
                        TextSpan(text: '${buckets[_active!].month} · 收入 '),
                        WidgetSpan(
                          alignment: PlaceholderAlignment.middle,
                          child: Money(
                            cents: income[_active!],
                            style: TextStyle(
                                color: widget.incomeColor, fontSize: 12),
                          ),
                        ),
                        TextSpan(text: ' · 支出 '),
                        WidgetSpan(
                          alignment: PlaceholderAlignment.middle,
                          child: Money(
                            cents: expense[_active!],
                            style: TextStyle(
                                color: widget.expenseColor, fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  )
                : Text('点一下柱子看单月明细',
                    style: TextStyle(color: widget.ink400, fontSize: 12)),
          ),
        ],
      ],
    );
  }

  Widget _legendItem(Color color, String label) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 12,
            height: 2,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(1),
            ),
          ),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(color: widget.ink500, fontSize: 11)),
        ],
      );
}

/// 双折线趋势图（收入 / 支出），顶点画圆点；命中月份画竖向虚线 + 两端实心点。
class _TrendPainter extends CustomPainter {
  final List<int> income;
  final List<int> expense;
  final Color incomeColor;
  final Color expenseColor;
  final Color baselineColor;
  final int? active;

  const _TrendPainter({
    required this.income,
    required this.expense,
    required this.incomeColor,
    required this.expenseColor,
    required this.baselineColor,
    this.active,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (income.isEmpty && expense.isEmpty) return;
    final all = [...income, ...expense];
    var maxV = 0;
    for (final v in all) {
      if (v > maxV) maxV = v;
    }
    final span = maxV <= 0 ? 1.0 : maxV.toDouble();
    const padX = 6.0;
    const padY = 12.0;
    final w = size.width - padX * 2;
    final h = size.height - padY * 2;
    final n = income.length;
    if (n == 0) return;

    Offset point(int i, int v) {
      final x = padX + (n == 1 ? w / 2 : w * i / (n - 1));
      final y = padY + h * (1 - v.toDouble() / span);
      return Offset(x, y);
    }

    // 基准线
    final basePaint = Paint()..color = baselineColor..strokeWidth = 1;
    canvas.drawLine(
        Offset(padX, padY + h), Offset(padX + w, padY + h), basePaint);

    void drawLine(List<int> values, Color color) {
      final pts = [for (var i = 0; i < n; i++) point(i, values[i])];
      final linePaint = Paint()
        ..color = color
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round;
      if (pts.length > 1) {
        final path = Path()..moveTo(pts.first.dx, pts.first.dy);
        for (var i = 1; i < pts.length; i++) path.lineTo(pts[i].dx, pts[i].dy);
        canvas.drawPath(path, linePaint);
      }
      final dotPaint = Paint()..color = color;
      for (final p in pts) canvas.drawCircle(p, 2.5, dotPaint);
    }

    // 命中月份高亮：竖向虚线 + 两端实心点
    if (active != null && active! >= 0 && active! < n) {
      final x = point(active!, 0).dx;
      final dashPaint = Paint()..color = baselineColor..strokeWidth = 1;
      var y = padY;
      while (y < padY + h) {
        final yEnd = (y + 2).clamp(padY, padY + h);
        canvas.drawLine(Offset(x, y), Offset(x, yEnd), dashPaint);
        y += 4;
      }
      canvas.drawCircle(
          point(active!, income[active!]), 3.5, Paint()..color = incomeColor);
      canvas.drawCircle(point(active!, expense[active!]), 3.5,
          Paint()..color = expenseColor);
    }

    drawLine(income, incomeColor);
    drawLine(expense, expenseColor);
  }

  @override
  bool shouldRepaint(covariant _TrendPainter old) =>
      old.income != income ||
      old.expense != expense ||
      old.incomeColor != incomeColor ||
      old.expenseColor != expenseColor ||
      old.baselineColor != baselineColor ||
      old.active != active;
}
