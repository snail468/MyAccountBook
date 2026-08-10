import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/money_text.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';
import 'search_state.dart';

/// 搜索页（设计 2:132）。
class SearchPage extends StatelessWidget {
  const SearchPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => SearchState()..load(),
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
    final state = context.watch<SearchState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final red = AppColors.lightSemanticRed;

    final results = state.filtered;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PageHeader(
            icon: '🔍',
            title: '搜索',
            subtitle: '跨账本按关键字 · 金额 · 时间 · 类别',
          ),

          // ---- 搜索框 ----
          TextField(
            onChanged: state.setQuery,
            decoration: InputDecoration(
              prefixIcon: Icon(Icons.search, color: ink400),
              hintText: '搜索账目、备注、金额',
              hintStyle: TextStyle(color: ink400),
              filled: true,
              fillColor: surface,
              contentPadding: const EdgeInsets.all(16),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: border, width: 1),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: border, width: 1),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: border, width: 1),
              ),
            ),
          ),
          const SizedBox(height: 12),

          // ---- 筛选分段 ----
          _FilterSegmented(
            value: state.filter,
            onChanged: state.setFilter,
          ),
          const SizedBox(height: 12),

          // ---- 结果 ----
          SectionLabel('结果'),
          if (results.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('没有匹配的结果',
                  style: TextStyle(color: ink500, fontSize: 13)),
            )
          else
            ...results.asMap().entries.map((entry) {
              final index = entry.key;
              final r = entry.value;
              final amountColor = index == 0 ? red : ink900;
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: AppCard(
                  frosted: false,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(r.title,
                                  style: TextStyle(
                                      color: ink900, fontSize: 15)),
                              const SizedBox(height: 2),
                              Text(r.subtitle,
                                  style: TextStyle(
                                      color: ink500, fontSize: 13)),
                            ],
                          ),
                        ),
                        MoneyText(r.cents, color: amountColor, fontSize: 16),
                      ],
                    ),
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}

/// 自包含筛选分段（全部 / 支出 / 收入 / 时间）。
class _FilterSegmented extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;
  const _FilterSegmented({required this.value, required this.onChanged});

  static const List<({String label, String value})> _options = [
    (label: '全部', value: 'all'),
    (label: '支出', value: 'expense'),
    (label: '收入', value: 'income'),
    (label: '时间', value: 'time'),
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final selectedBg = isDark ? AppColors.darkCtaFill : AppColors.lightInk900;
    final selectedText = isDark ? AppColors.darkCtaText : Colors.white;
    final unselBg = isDark ? AppColors.darkSurface : AppColors.lightSurfaceSubtle;
    final unselText = isDark ? AppColors.darkInk100 : AppColors.lightInk500;

    return Container(
      decoration: BoxDecoration(
        color: unselBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
          width: 1,
        ),
      ),
      child: Row(
        children: _options.map((o) {
          final sel = o.value == value;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChanged(o.value),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: sel ? selectedBg : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Center(
                  child: Text(
                    o.label,
                    style: TextStyle(
                      color: sel ? selectedText : unselText,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
