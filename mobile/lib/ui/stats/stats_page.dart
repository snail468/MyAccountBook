import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/money.dart';
import '../../theme/app_theme.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/money_text.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';
import 'stats_state.dart';

/// 统计页（设计 2:131）。
class StatsPage extends StatelessWidget {
  const StatsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => StatsState()..load(),
      child: Scaffold(
        backgroundColor: AppTheme.scaffoldBackground(context),
        body: const _Body(),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<StatsState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final track = isDark ? AppColors.darkBorder : AppColors.lightInk100;

    final incomeSeries = state.trend.map((t) => t.income).toList();
    final expenseSeries = state.trend.map((t) => t.expense).toList();
    final maxCat = state.categories.isEmpty
        ? 0
        : state.categories.map((c) => c.cents).reduce((a, b) => a > b ? a : b);

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 48, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PageHeader(
            icon: '📊',
            title: '统计',
            subtitle: '月度趋势 · 类别占比 · 环比同比',
          ),

          // ---- 3 汇总卡 ----
          Row(
            children: [
              Expanded(
                  child: _SummaryCard(label: '支出', cents: state.expense, color: ink900)),
              const SizedBox(width: 12),
              Expanded(
                  child: _SummaryCard(label: '收入', cents: state.income, color: ink900)),
              const SizedBox(width: 12),
              Expanded(
                  child: _SummaryCard(label: '结余', cents: state.balance, color: ink900)),
            ],
          ),
          const SizedBox(height: 16),

          // ---- 趋势卡 ----
          SectionLabel('趋势'),
          AppCard(
            frosted: false,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('趋势', style: TextStyle(color: ink500, fontSize: 13)),
                  const SizedBox(height: 12),
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final w = constraints.maxWidth;
                      return SizedBox(
                        height: 160,
                        width: w,
                        child: CustomPaint(
                          size: Size(w, 160),
                          painter: _TrendPainter(
                            income: incomeSeries,
                            expense: expenseSeries,
                            incomeColor: ink900,
                            expenseColor: ink500,
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // ---- 类别占比 ----
          SectionLabel('类别占比'),
          AppCard(
            frosted: false,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final avail = constraints.maxWidth;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: state.categories.map((c) {
                      final ratio = maxCat == 0 ? 0.0 : c.cents / maxCat;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(c.label,
                                    style: TextStyle(color: ink900, fontSize: 13)),
                                Text(Money.formatCents(c.cents),
                                    style: TextStyle(color: ink500, fontSize: 13)),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Container(
                              height: 8,
                              width: avail,
                              decoration: BoxDecoration(
                                color: track,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: avail * ratio,
                                    height: 8,
                                    decoration: BoxDecoration(
                                      color: ink900,
                                      borderRadius: BorderRadius.circular(4),
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
            ),
          ),
        ],
      ),
    );
  }
}

/// 月度趋势汇总卡（标题 + 金额）。
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
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(color: ink500, fontSize: 13)),
            const SizedBox(height: 6),
            MoneyText(cents,
                fontSize: 24, fontWeight: FontWeight.w700, color: color),
          ],
        ),
      ),
    );
  }
}

/// 双折线趋势图（收入 / 支出），顶点画圆点。
class _TrendPainter extends CustomPainter {
  final List<int> income;
  final List<int> expense;
  final Color incomeColor;
  final Color expenseColor;

  const _TrendPainter({
    required this.income,
    required this.expense,
    required this.incomeColor,
    required this.expenseColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final all = [...income, ...expense];
    if (all.isEmpty) return;
    final maxV = all.reduce((a, b) => a > b ? a : b).toDouble();
    final span = maxV == 0 ? 1.0 : maxV;
    final pad = 16.0;
    final w = size.width - pad * 2;
    final h = size.height - pad * 2;
    final n = income.length;
    if (n == 0) return;

    Offset point(int i, int v) {
      final x = pad + (n == 1 ? w / 2 : w * i / (n - 1));
      final y = pad + h * (1 - v.toDouble() / span);
      return Offset(x, y);
    }

    void drawLine(List<int> values, Color color) {
      final pts = [for (var i = 0; i < n; i++) point(i, values[i])];
      final linePaint = Paint()
        ..color = color
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round;
      if (pts.length > 1) {
        final path = Path()..moveTo(pts.first.dx, pts.first.dy);
        for (var i = 1; i < pts.length; i++) {
          path.lineTo(pts[i].dx, pts[i].dy);
        }
        canvas.drawPath(path, linePaint);
      }
      final dotPaint = Paint()..color = color;
      for (final p in pts) {
        canvas.drawCircle(p, 3, dotPaint);
      }
    }

    drawLine(income, incomeColor);
    drawLine(expense, expenseColor);
  }

  @override
  bool shouldRepaint(covariant _TrendPainter old) =>
      old.income != income ||
      old.expense != expense ||
      old.incomeColor != incomeColor ||
      old.expenseColor != expenseColor;
}
