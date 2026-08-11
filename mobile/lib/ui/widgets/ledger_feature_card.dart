import 'package:flutter/material.dart';
import '../../theme/design_tokens.dart';
import 'app_card.dart';

/// 首页功能入口卡片（[AppCard] 行布局，1:1 对齐 Ardot 功能卡）。
///
/// 前导 emoji(22) + Expanded 列（title ink900 size18 / subtitle ink500 size12）
/// + 尾随 "›" ink400 size18。内边距 16。卡片整体 64 高、圆角 16。
class LedgerFeatureCard extends StatelessWidget {
  final String icon; // emoji 字符串
  final String title;
  final String subtitle;
  final Widget? subtitleWidget; // 替代 subtitle 的自定义副标（如嵌入 Money）
  final VoidCallback? onTap;
  final String? badge;

  const LedgerFeatureCard({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle = '',
    this.subtitleWidget,
    this.onTap,
    this.badge,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;

    return AppCard(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            if (icon.isNotEmpty) ...[
              Text(icon, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          title,
                          style: TextStyle(
                            color: ink900,
                            fontSize: 18,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (badge != null) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: isDark
                                ? AppColors.darkSemanticRed
                                : AppColors.lightSemanticRed,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            badge!,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  subtitleWidget ??
                      Text(
                        subtitle,
                        style: TextStyle(color: ink500, fontSize: 12),
                      ),
                ],
              ),
            ),
            Text('›', style: TextStyle(color: ink400, fontSize: 18)),
          ],
        ),
      ),
    );
  }
}
