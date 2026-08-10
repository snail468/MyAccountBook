import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/app_text_field.dart';
import '../widgets/money.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';
import 'search_state.dart';

/// 搜索页（设计 2:132，对齐网页端 SearchClient）。
///
/// 本地-first：结果由 [SearchDao.searchAll] 实时聚合，按关键字 + 方向/时间筛选。
/// 筛选沿用既有 DAO 语义（全部 / 支出 / 收入 / 时间），不引入新的 DAO 方法。
class SearchPage extends StatelessWidget {
  const SearchPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => SearchState(),
      child: const _Body(),
    );
  }
}

class _Body extends StatefulWidget {
  const _Body();

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    // 首次加载由本页触发，便于在结果回来前展示「搜索中…」加载态。
    _loading = true;
    context.read<SearchState>().load().whenComplete(() {
      if (mounted) setState(() => _loading = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<SearchState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final green =
        isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;

    final results = state.filtered;

    return Container(
      color: pageBg,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const PageHeader(
                icon: '🔍',
                title: '搜索',
                subtitle: '跨全部账本查找记录',
              ),

              // ---- 搜索框 ----
              _SearchField(onChanged: state.setQuery),
              const SizedBox(height: 12),

              // ---- 筛选分段 ----
              _FilterSegmented(
                value: state.filter,
                onChanged: state.setFilter,
                surface: surface,
                border: border,
              ),
              const SizedBox(height: 16),

              // ---- 结果 ----
              const SectionLabel('结果'),
              if (_loading)
                _Hint(text: '搜索中…', color: ink400)
              else if (results.isEmpty)
                _Hint(text: '没有结果', color: ink400)
              else
                ...results.map(
                  (r) => _ResultCard(
                    result: r,
                    ink900: ink900,
                    ink500: ink500,
                    green: green,
                    red: red,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 搜索输入框：复用 [AppTextField]，通过 controller 把输入回传给 [SearchState]。
class _SearchField extends StatefulWidget {
  final ValueChanged<String> onChanged;
  const _SearchField({required this.onChanged});

  @override
  State<_SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends State<_SearchField> {
  final TextEditingController _ctl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _ctl.addListener(() => widget.onChanged(_ctl.text));
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppTextField(
        controller: _ctl,
        hint: '搜备注、类别、标签、活动标题…',
      );
}

/// 结果区占位文案（加载中 / 空）。
class _Hint extends StatelessWidget {
  final String text;
  final Color color;
  const _Hint({required this.text, required this.color});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Text(text, style: TextStyle(color: color, fontSize: 13)),
      );
}

/// 单条搜索结果：类型图标 + 标题 + 副标题 + 金额（收入绿 / 支出红）。
class _ResultCard extends StatelessWidget {
  final SearchResult result;
  final Color ink900;
  final Color ink500;
  final Color green;
  final Color red;

  const _ResultCard({
    required this.result,
    required this.ink900,
    required this.ink500,
    required this.green,
    required this.red,
  });

  @override
  Widget build(BuildContext context) {
    final isIncome = result.type == 'income';
    final accent = isIncome ? green : red;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        radius: 16,
        onTap: () {},
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  isIncome ? Icons.arrow_upward : Icons.arrow_downward,
                  color: accent,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(result.title,
                        style: TextStyle(
                            color: ink900,
                            fontSize: 15,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(result.subtitle,
                        style: TextStyle(color: ink500, fontSize: 13)),
                  ],
                ),
              ),
              Money(
                cents: result.cents,
                style: TextStyle(
                  color: accent,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 自包含筛选分段（全部 / 支出 / 收入 / 时间）。
class _FilterSegmented extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;
  final Color surface;
  final Color border;
  const _FilterSegmented({
    required this.value,
    required this.onChanged,
    required this.surface,
    required this.border,
  });

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
    final unselText = isDark ? AppColors.darkInk100 : AppColors.lightInk500;

    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: border, width: 1),
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
