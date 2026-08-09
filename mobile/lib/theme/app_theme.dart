import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/theme_state.dart';
import 'design_tokens.dart';

/// 应用主题：基于设计令牌构建的 Material 3 浅色/深色 [ThemeData]。
///
/// 风格：扁平卡片 + 1px 描边，无重阴影；圆角 16 卡 / 16 按钮与输入框（52pt 高）。
class AppTheme {
  AppTheme._();

  /// 浅色主题。
  static ThemeData get light => _build(Brightness.light);

  /// 深色主题。
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final colorScheme = ColorScheme.fromSeed(
      seedColor: dark ? AppColors.darkPageBg : AppColors.lightInk900,
      brightness: brightness,
      surface: dark ? AppColors.darkSurface : AppColors.lightSurface,
      onSurface: dark ? AppColors.darkInk100 : AppColors.lightInk900,
      primary: dark ? AppColors.darkInk100 : AppColors.lightInk900,
      onPrimary: dark ? AppColors.darkCtaText : Colors.white,
    );
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor:
          dark ? AppColors.darkPageBg : AppColors.lightPageBg,
      dividerColor: dark ? AppColors.darkBorder : AppColors.lightBorder,
      cardTheme: CardTheme(
        elevation: 0,
        color: dark ? AppColors.darkSurface : AppColors.lightSurface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor:
            dark ? AppColors.darkPageBg : AppColors.lightPageBg,
        foregroundColor: dark ? AppColors.darkInk100 : AppColors.lightInk900,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: dark ? AppColors.darkCtaFill : AppColors.lightInk900,
          foregroundColor: dark ? AppColors.darkCtaText : Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(
            color: dark ? AppColors.darkBorder : AppColors.lightBorder,
          ),
        ),
      ),
    );
  }

  /// 脚手架背景色。
  ///
  /// 当 [ThemeState.style] 为玻璃且当前非深色时返回磨砂背景 [AppColors.glassPageBg]，
  /// 否则返回当前主题对应的 pageBg。
  static Color scaffoldBackground(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final style = context.watch<ThemeState>().style;
    if (style == AppStyle.glass && !isDark) return AppColors.glassPageBg;
    return theme.scaffoldBackgroundColor;
  }
}
