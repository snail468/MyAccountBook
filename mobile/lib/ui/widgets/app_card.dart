import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../state/theme_state.dart';
import '../../theme/design_tokens.dart';

/// 统一卡片容器。
///
/// - 圆角 16；classic = surface 填充 + 1px border。
/// - glass（当 [ThemeState.style] 为玻璃时，亮/暗均生效）= 半透明填充 + 1px 描边 +
///   真实 `BackdropFilter` 磨砂模糊（对齐 globals.css `.liquid` 的
///   `backdrop-filter: blur(24px) saturate(180%)`）+ 柔和投影。
///
/// [frosted] 控制是否允许玻璃磨砂；超支提示卡等需要固定底色时应传 `false`。
class AppCard extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final bool frosted;
  final double radius;

  /// 显式填充色（如当前月高亮卡的深色底）。
  /// 传入时强制用实色填充并跳过玻璃磨砂，确保颜色一定生效；为 null 时沿用主题默认。
  final Color? color;

  const AppCard({
    super.key,
    required this.child,
    this.onTap,
    this.frosted = true,
    this.radius = 16,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final glass = frosted && context.watch<ThemeState>().style == AppStyle.glass;

    // 显式 color 时跳过玻璃磨砂（否则半透明会盖掉实色），保证高亮底色可见。
    final useGlass = glass && color == null;
    final borderColor = useGlass
        ? (isDark ? AppColors.darkGlassCardBorder : AppColors.glassCardBorder)
        : (isDark ? AppColors.darkBorder : AppColors.lightBorder);
    final fillColor = color ??
        (useGlass
            ? (isDark ? AppColors.darkGlassCardFill : AppColors.glassCardFill)
            : (isDark ? AppColors.darkSurface : AppColors.lightSurface));

    final container = Container(
      decoration: BoxDecoration(
        color: fillColor,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: borderColor, width: 1),
        // 玻璃态：柔和投影，对齐网页端 `0 8px 24px -12px rgba(31,38,135,0.2)`。
        boxShadow: useGlass
            ? [
                BoxShadow(
                  color: isDark
                      ? Colors.black.withOpacity(0.4)
                      : const Color(0x331F2687),
                  blurRadius: 24,
                  spreadRadius: -12,
                  offset: const Offset(0, 8),
                ),
              ]
            : null,
      ),
      child: child,
    );

    // 玻璃态：用 BackdropFilter 对卡片背后的渐变桌布做 24px 磨砂，叠加半透明填充
    // = 网页端 frosted glass 观感。ClipRRect 保证模糊区域被裁成圆角。
    // 显式 color 时跳过玻璃磨砂（useGlass 已为 false），保证实色高亮底可见。
    final glassed = useGlass
        ? ClipRRect(
            borderRadius: BorderRadius.circular(radius),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
              child: container,
            ),
          )
        : container;

    if (onTap == null) return glassed;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: glassed,
    );
  }
}
