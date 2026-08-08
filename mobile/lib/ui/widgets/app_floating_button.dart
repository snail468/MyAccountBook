import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../state/theme_state.dart';
import '../../theme/design_tokens.dart';

/// 右上角悬浮圆形按钮：44x44，按主题使用浮动按钮底色 + 描边。
///
/// [icon] 通常为 emoji [Text] 或 [Icon]，居中显示。
class AppFloatingButton extends StatelessWidget {
  final Widget icon;
  final VoidCallback? onPressed;

  const AppFloatingButton({
    super.key,
    required this.icon,
    this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final glass =
        context.watch<ThemeState>().style == AppStyle.glass && !isDark;

    final bg = glass
        ? AppColors.glassCardFill
        : (isDark
            ? AppColors.darkFloatingBtnBg
            : AppColors.lightFloatingBtnBg);
    final border = glass
        ? AppColors.glassCardBorder
        : (isDark
            ? AppColors.darkFloatingBtnBorder
            : AppColors.lightFloatingBtnBorder);

    return InkWell(
      borderRadius: BorderRadius.circular(22),
      onTap: onPressed,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: bg,
          border: Border.all(color: border, width: 1),
          borderRadius: BorderRadius.circular(22),
        ),
        child: Center(child: icon),
      ),
    );
  }
}
