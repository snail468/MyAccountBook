import 'package:flutter/material.dart';
import '../../theme/design_tokens.dart';
import 'app_card.dart';

/// 首页功能入口卡片（[AppCard] 行布局）。
///
/// 前导 emoji(24) + Expanded 列（title ink900 w600 size15 / subtitle ink500 size13）
/// + 尾随 "›" ink400 size20。内边距 16。
class LedgerFeatureCard extends StatelessWidget {
  final String icon; // emoji 字符串
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  const LedgerFeatureCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
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
            Text(icon, style: const TextStyle(fontSize: 24)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: ink900,
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(color: ink500, fontSize: 13),
                  ),
                ],
              ),
            ),
            Text('›', style: TextStyle(color: ink400, fontSize: 20)),
          ],
        ),
      ),
    );
  }
}
