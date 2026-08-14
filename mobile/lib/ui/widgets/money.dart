import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/money.dart' as money;
import '../../state/theme_state.dart';

/// 金额显示组件，对齐网页端 [Money]。
///
/// - 当 [ThemeState.amountsVisible] 为 false 时显示 `fallback`（默认 `·····`）。
/// - 为 true 时格式化为千分位无符号 "10,769.00"（对齐网页端 `formatYuan`）。
/// - [sign] 为 true 时正数带 `+` 前缀（用于支出/收入方向标注）。
class Money extends StatelessWidget {
  final int cents;
  final bool sign;
  final String fallback;
  final TextStyle? style;
  final TextOverflow? overflow;
  final int? maxLines;
  final TextAlign? textAlign;

  const Money({
    super.key,
    required this.cents,
    this.sign = false,
    this.fallback = '·····',
    this.style,
    this.overflow,
    this.maxLines,
    this.textAlign,
  });

  @override
  Widget build(BuildContext context) {
    final visible = context.select<ThemeState, bool>((s) => s.amountsVisible);
    final text = visible ? MoneyX.formatWithSign(cents, sign: sign) : fallback;
    return Text(
      text,
      style: style,
      overflow: overflow,
      maxLines: maxLines,
      textAlign: textAlign,
    );
  }
}

extension MoneyX on Money {
  /// 千分位无符号（正数可选 + 前缀），对齐网页端展示习惯。
  static String formatWithSign(int cents, {bool sign = false}) {
    final negative = cents < 0;
    final prefix = negative ? '-' : (sign ? '+' : '');
    return '$prefix${money.Money.formatPlain(cents.abs())}';
  }
}
