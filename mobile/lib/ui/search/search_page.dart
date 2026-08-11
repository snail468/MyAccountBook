import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/app_text_field.dart';
import '../widgets/money.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';
import 'search_state.dart';

/// 搜索页（设计 2:132，1:1 对齐网页端 SearchClient）。
///
/// 本地-first：结果由 [SearchDao.searchAll] 实时聚合，按关键字 + 方向 / 类别 /
/// 标签 / 金额区间 / 时间区间 / 搜索范围筛选。交互对齐网页端：顶部搜索框 + 「筛选」
/// 按钮（带生效条件角标）、方向分段（不限 / 收入 / 支出）、可展开的筛选面板、
/// 富结果卡片（来源徽标 + 备注 + 标签 + 日期 + 金额，可点击查看详情）、以及
/// 「加载更多」分页。
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
  bool _panelOpen = false;

  @override
  void initState() {
    super.initState();
    // 首次加载由本页触发，便于在结果回来前展示「搜索中…」加载态。
    _loading = true;
    context.read<SearchState>().load().whenComplete(() {
      if (mounted) setState(() => _loading = false);
    });
  }

  void _openDetail(SearchResult r) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _EntryDetailSheet(result: r),
    );
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

              // ---- 搜索框 + 筛选按钮（带生效条件角标）----
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: _SearchField(onChanged: state.setQuery)),
                  const SizedBox(width: 12),
                  _FilterButton(
                    activeCount: state.activeCount,
                    onTap: () => setState(() => _panelOpen = !_panelOpen),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // ---- 方向分段（不限 / 收入 / 支出）----
              _FilterSegmented(
                value: state.direction,
                onChanged: state.setDirection,
                surface: surface,
                border: border,
              ),
              const SizedBox(height: 16),

              // ---- 筛选面板（展开时）----
              if (_panelOpen)
                _FilterPanel(
                  key: ValueKey(state.resetNonce),
                  state: state,
                  onClose: () => setState(() => _panelOpen = false),
                ),

      // ---- 结果 ----
      const SectionLabel('结果'),
      if (_loading)
        _Hint(text: '搜索中…', color: ink400)
      else if (results.isEmpty)
        _Hint(
          text: state.activeCount == 0
              ? '输入关键字或设置筛选条件后开始搜索'
              : '没有匹配的记录',
          color: ink400,
        )
              else ...<Widget>[
                ...results.map(
                  (r) => _ResultCard(
                    result: r,
                    onTap: () => _openDetail(r),
                  ),
                ),
                if (state.hasMore)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: _LoadMoreButton(onTap: state.loadMore),
                  ),
              ],
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

/// 筛选按钮：点击展开/收起面板；右上角显示生效中的筛选条件数。
class _FilterButton extends StatelessWidget {
  final int activeCount;
  final VoidCallback onTap;
  const _FilterButton({required this.activeCount, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final badgeBg = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final badgeText = isDark ? AppColors.darkInk900 : AppColors.lightSurface;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        GestureDetector(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: border, width: 1),
            ),
            child: Text('筛选', style: TextStyle(color: ink500, fontSize: 14)),
          ),
        ),
        if (activeCount > 0)
          Positioned(
            top: -6,
            right: -6,
            child: Container(
              constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                color: badgeBg,
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: Text(
                '$activeCount',
                style: TextStyle(
                  color: badgeText,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  height: 1,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// 方向分段（不限 / 收入 / 支出），对齐网页端「收支方向」按钮组。
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
    (label: '不限', value: ''),
    (label: '收入', value: 'income'),
    (label: '支出', value: 'expense'),
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final selectedBg = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final selectedText = isDark ? AppColors.darkInk900 : AppColors.lightSurface;
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
                  color: sel ? selectedBg : surface,
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

/// 筛选面板：时间区间、金额区间、类别、标签、搜索范围；底部「清空筛选 / 应用」。
class _FilterPanel extends StatelessWidget {
  final SearchState state;
  final VoidCallback onClose;
  const _FilterPanel({
    super.key,
    required this.state,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface =
        isDark ? AppColors.darkSurface : AppColors.lightSurfaceSubtle;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _PanelField(
            label: '时间范围',
            child: Row(
              children: [
                _DateField(label: '起始', value: state.from, onPicked: state.setFrom),
                const SizedBox(width: 8),
                Text('–', style: TextStyle(color: ink400, fontSize: 13)),
                const SizedBox(width: 8),
                _DateField(label: '结束', value: state.to, onPicked: state.setTo),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _PanelField(
            label: '金额区间（元）',
            child: Row(
              children: [
                Expanded(
                  child: _PanelTextField(
                    hint: '最低',
                    initialValue: state.minYuan,
                    onChanged: state.setMinYuan,
                  ),
                ),
                const SizedBox(width: 8),
                Text('–', style: TextStyle(color: ink400, fontSize: 13)),
                const SizedBox(width: 8),
                Expanded(
                  child: _PanelTextField(
                    hint: '最高',
                    initialValue: state.maxYuan,
                    onChanged: state.setMaxYuan,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _PanelTextField(
                  hint: '类别',
                  initialValue: state.category,
                  onChanged: state.setCategory,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _PanelTextField(
                  hint: '标签',
                  initialValue: state.tag,
                  onChanged: state.setTag,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _PanelField(
            label: '搜索范围',
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: kSearchSources
                  .map(
                    (s) => _SourceChip(
                      context,
                      s,
                      state.sources.contains(s),
                      () => state.toggleSource(s),
                    ),
                  )
                  .toList(),
            ),
          ),
          if (state.sources.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                '一个范围都没选 —— 会当作全选处理',
                style: TextStyle(color: ink400, fontSize: 11),
              ),
            ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _PanelButton(label: '清空筛选', onTap: state.resetFilters),
              _PanelButton(
                label: '应用',
                primary: true,
                onTap: () {
                  state.load();
                  onClose();
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// 带小标题的面板区块。
class _PanelField extends StatelessWidget {
  final String label;
  final Widget child;
  const _PanelField({required this.label, required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: ink500, fontSize: 12)),
        const SizedBox(height: 4),
        child,
      ],
    );
  }
}

/// 面板用文本输入：自带 controller，仅在初始化时读取 [initialValue]
/// （配合面板按 resetNonce 重建实现「清空筛选」视觉重置）。
class _PanelTextField extends StatefulWidget {
  final String hint;
  final String initialValue;
  final ValueChanged<String> onChanged;
  const _PanelTextField({
    required this.hint,
    this.initialValue = '',
    required this.onChanged,
  });

  @override
  State<_PanelTextField> createState() => _PanelTextFieldState();
}

class _PanelTextFieldState extends State<_PanelTextField> {
  late final TextEditingController _ctl;

  @override
  void initState() {
    super.initState();
    _ctl = TextEditingController(text: widget.initialValue);
    _ctl.addListener(() => widget.onChanged(_ctl.text));
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      AppTextField(controller: _ctl, hint: widget.hint);
}

/// 面板用日期选择（对齐网页端 type=date）：点击弹出 date picker。
class _DateField extends StatelessWidget {
  final String label;
  final String value;
  final ValueChanged<String> onPicked;
  const _DateField({
    required this.label,
    required this.value,
    required this.onPicked,
  });

  Future<void> _pick(BuildContext context) async {
    final initial = DateTime.tryParse(value) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      onPicked(
        '${picked.year}-${picked.month.toString().padLeft(2, '0')}-'
        '${picked.day.toString().padLeft(2, '0')}',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final hintColor = isDark ? AppColors.darkInk400 : AppColors.lightInk400;

    return Expanded(
      child: GestureDetector(
        onTap: () => _pick(context),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: border, width: 1),
          ),
          child: Text(
            value.isEmpty ? label : value,
            style: TextStyle(
              color: value.isEmpty ? hintColor : ink500,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

/// 搜索范围切换芯片（选中=填充，未选=描边）。
Widget _SourceChip(
  BuildContext context,
  String source,
  bool selected,
  VoidCallback onTap,
) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
  final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
  final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
  final primaryBg = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
  final primaryText = isDark ? AppColors.darkInk900 : AppColors.lightSurface;
  return GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: selected ? primaryBg : surface,
        borderRadius: BorderRadius.circular(8),
        border: selected ? null : Border.all(color: border, width: 1),
      ),
      child: Text(
        kSourceLabel[source] ?? source,
        style: TextStyle(
          color: selected ? primaryText : ink500,
          fontSize: 12,
        ),
      ),
    ),
  );
}

/// 面板底部按钮（primary=填充，默认=描边）。
class _PanelButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final bool primary;
  const _PanelButton({
    required this.label,
    required this.onTap,
    this.primary = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final primaryBg = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final primaryText = isDark ? AppColors.darkInk900 : AppColors.lightSurface;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: primary ? primaryBg : surface,
          borderRadius: BorderRadius.circular(10),
          border: primary ? null : Border.all(color: border, width: 1),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: primary ? primaryText : ink500,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
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

/// 单条搜索结果：来源徽标 + 标题 + 备注 + 标签 + 日期 + 金额（收入绿 / 支出 ink900）。
class _ResultCard extends StatelessWidget {
  final SearchResult result;
  final VoidCallback onTap;
  const _ResultCard({required this.result, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final badgeBg = isDark ? AppColors.darkBorder : AppColors.lightInk100;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;
    final amountColor = result.direction == 'income' ? green : ink900;
    final badgeText = result.ledgerName ?? kSourceLabel[result.source] ?? result.source;
    final tags = result.tagList;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        radius: 16,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 来源徽标 + 标题
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: badgeBg,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            badgeText,
                            style: TextStyle(color: ink500, fontSize: 10),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            result.title,
                            style: TextStyle(
                              color: ink900,
                              fontSize: 15,
                              fontWeight: FontWeight.w500,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    // 备注
                    if (result.note != null && result.note!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          result.note!,
                          style: TextStyle(color: ink500, fontSize: 12),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    // 标签
                    if (tags.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Wrap(
                          spacing: 4,
                          runSpacing: 4,
                          children: tags
                              .map(
                                (t) => Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: badgeBg,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    t,
                                    style: TextStyle(
                                      color: ink500,
                                      fontSize: 10,
                                    ),
                                  ),
                                ),
                              )
                              .toList(),
                        ),
                      ),
                    // 日期
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        result.dateYmd,
                        style: TextStyle(color: ink400, fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Money(
                cents: result.amountCents,
                style: TextStyle(
                  color: amountColor,
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

/// 加载更多（对齐网页端「加载更多」分页按钮）。
class _LoadMoreButton extends StatelessWidget {
  final VoidCallback onTap;
  const _LoadMoreButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: border, width: 1),
        ),
        child: Center(
          child: Text('加载更多', style: TextStyle(color: ink500, fontSize: 14)),
        ),
      ),
    );
  }
}

/// 点击结果卡片后弹出的详情面板（对齐网页端点击进入条目）。
class _EntryDetailSheet extends StatelessWidget {
  final SearchResult result;
  const _EntryDetailSheet({required this.result});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final badgeBg = isDark ? AppColors.darkBorder : AppColors.lightInk100;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;
    final amountColor = result.direction == 'income' ? green : ink900;
    final badgeText = result.ledgerName ?? kSourceLabel[result.source] ?? result.source;
    final tags = result.tagList;

    return Padding(
      padding: EdgeInsets.only(
        top: 8,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: badgeBg,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(badgeText, style: TextStyle(color: ink500, fontSize: 10)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  result.title,
                  style: TextStyle(
                    color: ink900,
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Text('金额', style: TextStyle(color: ink500, fontSize: 13)),
              const SizedBox(width: 8),
              Money(
                cents: result.amountCents,
                style: TextStyle(
                  color: amountColor,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text('方向', style: TextStyle(color: ink500, fontSize: 13)),
              const SizedBox(width: 8),
              Text(
                result.direction == 'income' ? '收入' : '支出',
                style: TextStyle(color: ink900, fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text('日期', style: TextStyle(color: ink500, fontSize: 13)),
              const SizedBox(width: 8),
              Text(result.dateYmd, style: TextStyle(color: ink900, fontSize: 13)),
            ],
          ),
          if (result.note != null && result.note!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('备注', style: TextStyle(color: ink500, fontSize: 13)),
            const SizedBox(height: 2),
            Text(result.note!, style: TextStyle(color: ink900, fontSize: 13)),
          ],
          if (tags.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('标签', style: TextStyle(color: ink500, fontSize: 13)),
            const SizedBox(height: 4),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: tags
                  .map(
                    (t) => Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: badgeBg,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        t,
                        style: TextStyle(color: ink500, fontSize: 10),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: Builder(
              builder: (ctx) {
                final dark = Theme.of(ctx).brightness == Brightness.dark;
                final pb = dark ? AppColors.darkInk100 : AppColors.lightInk900;
                final pt = dark ? AppColors.darkInk900 : AppColors.lightSurface;
                return GestureDetector(
                  onTap: () => Navigator.of(ctx).pop(),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: pb,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Center(
                      child: Text(
                        '关闭',
                        style: TextStyle(color: pt, fontSize: 14),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
