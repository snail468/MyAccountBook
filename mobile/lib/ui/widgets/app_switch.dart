import 'package:flutter/material.dart';
import '../../theme/design_tokens.dart';

/// 开关：开 = 轨道 ink900、拇指白；关 = 轨道 #CBD5E1、拇指白。
class AppSwitch extends StatelessWidget {
  final bool value;
  final ValueChanged<bool>? onChanged;

  const AppSwitch({
    super.key,
    required this.value,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final activeTrack = isDark ? AppColors.darkInk100 : AppColors.lightInk900;

    return Switch(
      value: value,
      onChanged: onChanged,
      activeTrackColor: activeTrack,
      activeColor: Colors.white,
      inactiveTrackColor: isDark ? AppColors.darkBorder : AppColors.lightBorderDashed,
      inactiveThumbColor: Colors.white,
    );
  }
}
