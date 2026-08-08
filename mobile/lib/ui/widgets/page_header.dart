import 'package:flutter/material.dart';
import '../../theme/design_tokens.dart';
import '../settings_page.dart';
import 'app_floating_button.dart';

/// 子页面统一头部（对齐设计稿 2:131–2:137）。
///
/// 右上三个悬浮钮：
///   🏠 回家 → [Navigator.pop]（这些页是 push 在首页之上）
///   👁 眼睛 → no-op（与阶段二一致）
///   ⚙️ 设置 → push [SettingsPage]
/// 下方：页面图标（emoji）+ 标题（ink900 w700）+ 副标（ink500）。
class PageHeader extends StatelessWidget {
  final String icon;
  final String title;
  final String subtitle;

  const PageHeader({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            AppFloatingButton(
              icon: const Text('🏠', style: TextStyle(fontSize: 20)),
              onPressed: () => Navigator.of(context).pop(),
            ),
            const SizedBox(width: 10),
            AppFloatingButton(
              icon: const Text('👁', style: TextStyle(fontSize: 20)),
              onPressed: () {
                // 占位：眼睛入口（no-op，与阶段二一致）
              },
            ),
            const SizedBox(width: 10),
            AppFloatingButton(
              icon: const Text('⚙️', style: TextStyle(fontSize: 20)),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SettingsPage()),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(icon, style: TextStyle(fontSize: 28, color: ink900)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                          color: ink900,
                          fontSize: 22,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: TextStyle(color: ink500, fontSize: 13)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}
