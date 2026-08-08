import 'package:flutter/material.dart';
import '../../theme/design_tokens.dart';

/// 区块小标题：ink500 size13，上 padding16 / 下4。
class SectionLabel extends StatelessWidget {
  final String text;

  const SectionLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final color = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 4),
      child: Text(text, style: TextStyle(color: color, fontSize: 13)),
    );
  }
}
