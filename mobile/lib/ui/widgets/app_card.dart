import 'package:flutter/material.dart';
import '../../state/theme_state.dart';
import '../../theme/design_tokens.dart';

/// 统一卡片容器。
///
/// - 圆角 16；classic = surface 填充 + 1px border。
/// - glass（仅当 [ThemeState.style] 为玻璃且非深色时）= 白 0.5 填充 + 白 0.7 描边（磨砂质感）。
/// - 无阴影。
///
/// [frosted] 控制是否允许玻璃磨砂；超支提示卡等需要固定底色时应传 `false`。
class AppCard extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final bool frosted;

  const AppCard({
    super.key,
    required this.child,
    this.onTap,
    this.frosted = true,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final glass = frosted &&
        context.watch<ThemeState>().style == AppStyle.glass &&
        !isDark;

    final borderColor = glass
        ? AppColors.glassCardBorder
        : (isDark ? AppColors.darkBorder : AppColors.lightBorder);
    final fillColor = glass
        ? AppColors.glassCardFill
        : (isDark ? AppColors.darkSurface : AppColors.lightSurface);

    final container = Container(
      decoration: BoxDecoration(
        color: fillColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor, width: 1),
      ),
      child: child,
    );

    if (onTap == null) return container;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: container,
    );
  }
}
