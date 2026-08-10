import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/theme_state.dart';
import '../theme/design_tokens.dart';
import '../theme/app_theme.dart';
import 'widgets/app_card.dart';
import 'widgets/app_switch.dart';
import 'widgets/app_primary_button.dart';

/// 设置页（设计 2:139）：外观 · 光效 · 音效。
///
/// 所有改动即时写入 [ThemeState] 并 [ThemeState.save] 持久化。
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final themeState = context.watch<ThemeState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('外观 · 光效 · 音效',
                style: TextStyle(
                    color: ink900, fontSize: 22, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            AppCard(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('外观模式',
                        style: TextStyle(color: ink500, fontSize: 13)),
                    const SizedBox(height: 8),
                    _Segmented<AppThemeMode>(
                      options: const [
                        (label: '白天', value: AppThemeMode.light),
                        (label: '黑夜', value: AppThemeMode.dark),
                        (label: '跟随系统', value: AppThemeMode.system),
                      ],
                      value: themeState.themeMode,
                      onChanged: (v) => themeState.setThemeMode(v),
                    ),
                    const SizedBox(height: 16),
                    Text('界面风格',
                        style: TextStyle(color: ink500, fontSize: 13)),
                    const SizedBox(height: 8),
                    // 界面风格：默认 / 玻璃 双选项，均可选（对齐 globals.css .liquid 液态玻璃）。
                    _Segmented<AppStyle>(
                      options: const [
                        (label: '默认', value: AppStyle.classic),
                        (label: '玻璃', value: AppStyle.glass),
                      ],
                      value: themeState.style,
                      onChanged: (v) => themeState.setStyle(v),
                    ),
                    const SizedBox(height: 16),
                    Text('字号',
                        style: TextStyle(color: ink500, fontSize: 13)),
                    const SizedBox(height: 8),
                    _Segmented<double>(
                      options: const [
                        (label: '小', value: 0.9),
                        (label: '标准', value: 1.0),
                        (label: '大', value: 1.15),
                      ],
                      value: themeState.fontScale,
                      onChanged: (v) => themeState.setFontScale(v),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            AppCard(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    _SettingRow(
                      title: '光效',
                      subtitle: '星空风格：紫色涟漪 + 星芒',
                      trailing: AppSwitch(
                        value: themeState.effectOn,
                        onChanged: (v) => themeState.setEffectOn(v),
                      ),
                    ),
                    const Divider(height: 1),
                    _SettingRow(
                      title: '音效',
                      subtitle: '首页用一段声，其它页面用另一段',
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TextButton(
                            onPressed: () {
                              // 第二阶段：试听/试看逻辑
                            },
                            child: Text('试听 / 试看',
                                style: TextStyle(color: ink500, fontSize: 13)),
                          ),
                          AppSwitch(
                            value: themeState.soundOn,
                            onChanged: (v) => themeState.setSoundOn(v),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            AppPrimaryButton(
              label: '完成',
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }
}

/// 设置行：标题 + 副标题 + 右侧控件。
class _SettingRow extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget trailing;

  const _SettingRow({
    required this.title,
    required this.subtitle,
    required this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: TextStyle(
                        color: ink900,
                        fontSize: 15,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(subtitle, style: TextStyle(color: ink500, fontSize: 13)),
              ],
            ),
          ),
          trailing,
        ],
      ),
    );
  }
}

/// 分段选择器：选中 = ink900 填充白字；未选 = surfaceSubtle 墨字。
class _Segmented<T> extends StatelessWidget {
  final List<({String label, T value})> options;
  final T value;
  final ValueChanged<T> onChanged;
  final Set<T>? disabled;

  const _Segmented({
    required this.options,
    required this.value,
    required this.onChanged,
    this.disabled,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final selectedBg = isDark ? AppColors.darkCtaFill : AppColors.lightInk900;
    final selectedText = isDark ? AppColors.darkCtaText : Colors.white;
    final unselBg =
        isDark ? AppColors.darkSurface : AppColors.lightSurfaceSubtle;
    final unselText = isDark ? AppColors.darkInk100 : AppColors.lightInk900;

    return Container(
      decoration: BoxDecoration(
        color: unselBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
          width: 1,
        ),
      ),
      child: Row(
        children: options.map((o) {
          final sel = o.value == value;
          final isDisabled = disabled?.contains(o.value) ?? false;
          return Expanded(
            child: GestureDetector(
              onTap: isDisabled ? null : () => onChanged(o.value),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: sel ? selectedBg : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Center(
                  child: Text(
                    isDisabled ? '${o.label} · 即将推出' : o.label,
                    style: TextStyle(
                      color: isDisabled
                          ? (isDark ? AppColors.darkInk500 : AppColors.lightInk400)
                          : (sel ? selectedText : unselText),
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
