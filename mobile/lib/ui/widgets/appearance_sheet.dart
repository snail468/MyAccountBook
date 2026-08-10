import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../state/theme_state.dart';
import '../../theme/design_tokens.dart';
import 'app_primary_button.dart';
import 'app_switch.dart';

/// 首页「外观」快捷面板（👁 浮动按钮入口），对齐设计稿 2:139。
///
/// 覆盖：主题模式 / 界面风格（隐藏液态玻璃，仅保留「默认」）/ 字号 /
/// 光效开关 / 音效开关 + 试听 / 完成。所有改动即时写入 [ThemeState] 并持久化。
class AppearanceSheet extends StatelessWidget {
  const AppearanceSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final ts = context.watch<ThemeState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;

    // 界面风格：显示双选项 [默认(可选) | 玻璃(置灰禁用+即将推出)]，玻璃不可选（Q3/A5）。
    final styleValue =
        ts.style == AppStyle.glass ? AppStyle.classic : ts.style;

    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).padding.bottom + 16,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
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
          // 界面风格：默认(可选) + 玻璃(置灰禁用 + 即将推出，不可点)
          Container(
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurface : AppColors.lightSurfaceSubtle,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                width: 1,
              ),
            ),
            child: Row(
              children: [
                _StyleChip(
                  label: '默认',
                  selected: styleValue == AppStyle.classic,
                  onTap: () => ts.setStyle(AppStyle.classic),
                ),
                _StyleChip(
                  label: '玻璃',
                  disabled: true,
                  badge: '即将推出',
                ),
              ],
            ),
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
          const SizedBox(height: 16),
          const Divider(height: 1),
          const SizedBox(height: 8),
          // 光效
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('光效',
                        style: TextStyle(
                            color: ink900,
                            fontSize: 15,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text('星空风格：紫色涟漪 + 星芒',
                        style: TextStyle(color: ink500, fontSize: 13)),
                  ],
                ),
              ),
              AppSwitch(
                value: ts.effectOn,
                onChanged: (v) => ts.setEffectOn(v),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Divider(height: 1),
          const SizedBox(height: 8),
          // 音效 + 试听
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('音效',
                        style: TextStyle(
                            color: ink900,
                            fontSize: 15,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text('首页用一段声，其它页面用另一段',
                        style: TextStyle(color: ink500, fontSize: 13)),
                  ],
                ),
              ),
              TextButton(
                onPressed: () {
                  // 第二阶段：试听/试看逻辑（无音视频资源，仅 UI 占位，见 PRD P2-04）
                },
                child:
                    Text('试听', style: TextStyle(color: ink400, fontSize: 13)),
              ),
              AppSwitch(
                value: ts.soundOn,
                onChanged: (v) => ts.setSoundOn(v),
              ),
            ],
          ),
          const SizedBox(height: 16),
          AppPrimaryButton(
            label: '完成',
            onPressed: () => Navigator.of(context).pop(),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

/// 界面风格选项 chip：默认可选；玻璃置灰禁用 + 「即将推出」。
class _StyleChip extends StatelessWidget {
  final String label;
  final bool selected;
  final bool disabled;
  final String? badge;
  final VoidCallback? onTap;

  const _StyleChip({
    required this.label,
    this.selected = false,
    this.disabled = false,
    this.badge,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fg = disabled
        ? (isDark ? AppColors.darkInk500 : AppColors.lightInk400)
        : (selected
            ? (isDark ? AppColors.darkCtaText : Colors.white)
            : (isDark ? AppColors.darkInk100 : AppColors.lightInk900));
    final bg = selected && !disabled
        ? (isDark ? AppColors.darkCtaFill : AppColors.lightInk900)
        : Colors.transparent;
    final borderColor = disabled
        ? (isDark ? AppColors.darkBorder : AppColors.lightBorderDashed)
        : (selected
            ? Colors.transparent
            : (isDark ? AppColors.darkBorder : AppColors.lightBorder));
    return Expanded(
      child: GestureDetector(
        onTap: disabled ? null : onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: borderColor, width: 1),
          ),
          child: Center(
            child: Text(
              badge != null ? '$label · $badge' : label,
              style: TextStyle(
                color: fg,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
