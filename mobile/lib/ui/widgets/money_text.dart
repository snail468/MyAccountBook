import 'package:flutter/material.dart';
import '../../core/money.dart';
import '../../theme/design_tokens.dart';

/// 金额文本：使用 [Money.formatCents] 格式化。
///
/// 默认 ink900；支出可传入 [AppColors.lightSemanticRed] 等颜色。
class MoneyText extends StatelessWidget {
  final int cents;
  final Color? color;
  final double? fontSize;
  final FontWeight? fontWeight;

  const MoneyText(
    this.cents, {
    super.key,
    this.color,
    this.fontSize,
    this.fontWeight,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final defaultColor = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    return Text(
      Money.formatCents(cents),
      style: TextStyle(
        color: color ?? defaultColor,
        fontSize: fontSize,
        fontWeight: fontWeight,
      ),
    );
  }
}
