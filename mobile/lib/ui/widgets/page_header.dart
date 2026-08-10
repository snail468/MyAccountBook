import 'package:flutter/material.dart';
import '../../theme/design_tokens.dart';
import 'floating_toolbar.dart';
import 'home_button.dart';
import 'page_back_button.dart';

export 'floating_toolbar.dart';
export 'home_button.dart';
export 'page_back_button.dart';

/// 子页面统一头部（对齐设计稿 2:131–2:139 / PRD §3.2 / A3）。
///
/// 三段式布局：
///   · 顶部悬浮控件区：左上 [HomeButton]（回家）+ 右上 [FloatingToolbar]（眼/设置，各 40×40 r20）。
///   · 内容区首行：左侧 [PageBackButton]（‹ 返回）+ 页面图标 + 标题(ink900 w700) + 副标(ink500)，标题占 flex-1。
class PageHeader extends StatelessWidget {
  final String icon;
  final String title;
  final String subtitle;
  /// 标题行右侧的附加操作（如账本的协作/设置图标）。默认 null，向后兼容。
  final List<Widget>? actions;

  const PageHeader({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.actions,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 顶部悬浮控件：左上回家，右上 眼/设置。
        const Row(
          children: [
            HomeButton(),
            Spacer(),
            FloatingToolbar(),
          ],
        ),
        const SizedBox(height: 12),
        // 返回 + 标题（标题占 flex-1）。
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const PageBackButton(),
            const SizedBox(width: 6),
            Text(icon, style: const TextStyle(fontSize: 24)),
            const SizedBox(width: 10),
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
            if (actions != null) ...<Widget>[
              const SizedBox(width: 8),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: actions!,
              ),
            ],
          ],
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}
