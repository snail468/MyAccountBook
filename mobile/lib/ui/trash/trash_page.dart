import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/money_text.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';
import 'trash_state.dart';

/// 回收站页（设计 2:135）。
class TrashPage extends StatelessWidget {
  const TrashPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => TrashState()..load(),
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
    final state = context.watch<TrashState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final red = AppColors.lightSemanticRed;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 48, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PageHeader(
            icon: '🗑️',
            title: '回收站',
            subtitle: '删除的记录 · 60 天内可恢复',
          ),

          SectionLabel('回收站'),
          if (state.items.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('回收站是空的',
                  style: TextStyle(color: ink500, fontSize: 13)),
            )
          else
            ...state.items.map((i) => _TrashTile(item: i)),

          const SizedBox(height: 16),
          Text(
            '删除的记录会在 60 天后自动清除，期间可随时恢复。',
            style: TextStyle(color: ink400, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _TrashTile extends StatelessWidget {
  final TrashItem item;
  const _TrashTile({required this.item});

  void _restore(BuildContext context) {
    context.read<TrashState>().restore(item);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('已恢复')),
    );
  }

  void _delete(BuildContext context) {
    context.read<TrashState>().permanentDelete(item);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('已永久删除')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final red = AppColors.lightSemanticRed;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        frosted: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(item.title,
                        style: TextStyle(color: ink900, fontSize: 15)),
                  ),
                  MoneyText(item.cents, color: ink900, fontSize: 16),
                ],
              ),
              const SizedBox(height: 4),
              Text(item.content,
                  style: TextStyle(color: ink500, fontSize: 13)),
              const SizedBox(height: 4),
              Text('${item.daysAgo} 天前删除',
                  style: TextStyle(color: ink400, fontSize: 13)),
              const SizedBox(height: 8),
              Row(
                children: [
                  GestureDetector(
                    onTap: () => _restore(context),
                    child: Text('恢复',
                        style: TextStyle(color: ink500, fontSize: 13)),
                  ),
                  const SizedBox(width: 16),
                  GestureDetector(
                    onTap: () => _delete(context),
                    child: Text('删除', style: TextStyle(color: red, fontSize: 13)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
