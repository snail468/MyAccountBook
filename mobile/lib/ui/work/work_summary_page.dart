import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/constants.dart';
import '../../data/local/work_entry_dao.dart';
import '../../state/ledger_list_state.dart';
import '../../theme/app_theme.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/money_text.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';

/// 工作出项汇总页（首页"工作出项汇总"功能卡落地页）。
///
/// 聚合**所有**工作账本（`LedgerListState.byKind(AppConfig.kindWork)`）的
/// 按月垫款/回款，按月份合并后展示：
///   - 垫款总额 = Σ expense
///   - 回款总额 = Σ income
///   - 待回款   = 垫款 − 回款（净额；为负表示回款多于垫款）
///
/// 数据来自本地 DAO，异步加载；DB 异常按空数据处理，页面不崩溃。
class WorkSummaryPage extends StatefulWidget {
  const WorkSummaryPage({super.key});

  @override
  State<WorkSummaryPage> createState() => _WorkSummaryPageState();
}

class _WorkSummaryPageState extends State<WorkSummaryPage> {
  /// 合并后的按月汇总；键为 'YYYY-MM'，值为 (income, expense)。
  Map<String, ({int income, int expense})> _byMonth = {};

  /// 垫款总额（Σ expense）。
  int _advance = 0;

  /// 回款总额（Σ income）。
  int _refund = 0;

  /// 待回款 = 垫款 − 回款（净额，可能为负）。
  int _pending = 0;

  /// 是否正在加载。
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    // 首帧后再异步加载（与 [HomePage._loadSummary] 一致），避免 build 期间触碰 context。
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  /// 加载并合并所有工作账本的按月汇总。
  ///
  /// 整段包 try/catch：DB 异常时按空数据处理（仅停止 loading，不崩溃）。
  Future<void> _load() async {
    try {
      // 复用 App 级 LedgerListState（HomePage 已 load 过；此处再 load 一次保证最新）。
      final state = context.read<LedgerListState>();
      await state.load();
      final ledgers = state.byKind(AppConfig.kindWork);

      final merged = <String, ({int income, int expense})>{};
      for (final ledger in ledgers) {
        final monthly = await WorkEntryDao().totalsByMonth(ledger.id);
        monthly.forEach((ym, totals) {
          final cur = merged[ym] ?? (income: 0, expense: 0);
          merged[ym] = (
            income: cur.income + totals.income,
            expense: cur.expense + totals.expense,
          );
        });
      }

      int advance = 0;
      int refund = 0;
      for (final totals in merged.values) {
        advance += totals.expense;
        refund += totals.income;
      }

      if (!mounted) return;
      setState(() {
        _byMonth = merged;
        _advance = advance;
        _refund = refund;
        _pending = advance - refund;
        _loading = false;
      });
    } catch (_) {
      // 异常：保持空数据，仅结束 loading，不崩溃。
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    // 待回款为正（仍有垫款未回）才用红色提示；为负/零用主文本色。
    final pendingColor = _pending > 0
        ? AppColors.lightSemanticRed
        : (isDark ? AppColors.darkInk100 : AppColors.lightInk900);

    // 月份倒序（'YYYY-MM' 字符串可直接按字典序比较）。
    final months = _byMonth.keys.toList()
      ..sort((a, b) => b.compareTo(a));

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 48, 16, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ---- 头部 + 悬浮钮 ----
            PageHeader(
              icon: '📤',
              title: '工作出项汇总',
              subtitle: '按月垫款与回款汇总',
            ),
            const SizedBox(height: 16),

            // ---- 三个汇总块 ----
            Row(
              children: [
                Expanded(
                  child: _SummaryTile(
                    title: '垫款',
                    cents: _advance,
                    color: ink900,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _SummaryTile(
                    title: '回款',
                    cents: _refund,
                    color: ink900,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _SummaryTile(
                    title: '待回款',
                    cents: _pending,
                    color: pendingColor,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            SectionLabel('按月查看'),

            // ---- 加载中 / 空状态 / 月卡列表 ----
            if (_loading)
              Text('加载中…', style: TextStyle(color: ink500, fontSize: 13))
            else if (_byMonth.isEmpty)
              Text('还没有工作账本记录',
                  style: TextStyle(color: ink500, fontSize: 13))
            else
              ...months.map((ym) {
                final totals = _byMonth[ym]!;
                final net = totals.expense - totals.income;
                final parts = ym.split('-');
                final label = '${parts[0]}年${int.parse(parts[1])}月';
                final netColor = net > 0
                    ? AppColors.lightSemanticRed
                    : (isDark ? AppColors.darkInk100 : AppColors.lightInk900);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: AppCard(
                    frosted: false,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            label,
                            style: TextStyle(
                              color: ink900,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: _MonthStat(
                                  label: '垫款',
                                  cents: totals.expense,
                                  color: ink900,
                                ),
                              ),
                              Expanded(
                                child: _MonthStat(
                                  label: '回款',
                                  cents: totals.income,
                                  color: ink900,
                                ),
                              ),
                              Expanded(
                                child: _MonthStat(
                                  label: '待回款',
                                  cents: net,
                                  color: netColor,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}

/// 顶部三汇总块（参考 [WorkLedgerPage._SummaryTile] 风格）。
class _SummaryTile extends StatelessWidget {
  final String title;
  final int cents;
  final Color color;

  const _SummaryTile({
    required this.title,
    required this.cents,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return AppCard(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 6),
            MoneyText(cents,
                fontSize: 17, fontWeight: FontWeight.w700, color: color),
          ],
        ),
      ),
    );
  }
}

/// 月卡内的单项统计（标签 + 金额）。
class _MonthStat extends StatelessWidget {
  final String label;
  final int cents;
  final Color color;

  const _MonthStat({
    required this.label,
    required this.cents,
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
        MoneyText(cents,
            fontSize: 15, fontWeight: FontWeight.w600, color: color),
      ],
    );
  }
}
