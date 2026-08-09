import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../state/theme_state.dart';
import '../../theme/design_tokens.dart';

/// 首页「外观」快捷面板（👁 浮动按钮入口）。
///
/// 仅覆盖最核心的三项外观开关：主题模式 / 界面风格 / 字号。
/// 光效、音效、导出等完整设置仍走 [SettingsPage]（✨ 按钮），避免重复。
/// 所有改动即时写入 [ThemeState] 并持久化。
class AppearanceSheet extends StatelessWidget {
  const AppearanceSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final ts = context.watch<ThemeState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).padding.bottom + 16,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('外观',
              style: TextStyle(
                  color: ink900, fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 14),
          Text('主题模式', style: TextStyle(color: ink500, fontSize: 13)),
          const SizedBox(height: 8),
          SegmentedButton<AppThemeMode>(
            segments: const [
              ButtonSegment(value: AppThemeMode.light, label: Text('白天')),
              ButtonSegment(value: AppThemeMode.dark, label: Text('黑夜')),
              ButtonSegment(value: AppThemeMode.system, label: Text('系统')),
            ],
            selected: {ts.themeMode},
            onSelectionChanged: (s) => ts.setThemeMode(s.first),
          ),
          const SizedBox(height: 16),
          Text('界面风格', style: TextStyle(color: ink500, fontSize: 13)),
          const SizedBox(height: 8),
          SegmentedButton<AppStyle>(
            segments: const [
              ButtonSegment(value: AppStyle.classic, label: Text('默认')),
              ButtonSegment(value: AppStyle.glass, label: Text('玻璃')),
            ],
            selected: {ts.style},
            onSelectionChanged: (s) => ts.setStyle(s.first),
          ),
          const SizedBox(height: 16),
          Text('字号', style: TextStyle(color: ink500, fontSize: 13)),
          const SizedBox(height: 8),
          SegmentedButton<double>(
            segments: const [
              ButtonSegment(value: 0.9, label: Text('小')),
              ButtonSegment(value: 1.0, label: Text('标准')),
              ButtonSegment(value: 1.15, label: Text('大')),
            ],
            selected: {ts.fontScale},
            onSelectionChanged: (s) => ts.setFontScale(s.first),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
