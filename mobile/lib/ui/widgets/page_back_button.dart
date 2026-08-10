import 'package:flutter/material.dart';
import '../../theme/design_tokens.dart';

/// 子页左上「‹ 返回」按钮，Pop 返回上一页。
///
/// 放左侧（勿放右侧，会与右上 [FloatingToolbar] 冲突），与标题同行 flex-1（PRD §3.2/A3）。
class PageBackButton extends StatelessWidget {
  const PageBackButton({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => Navigator.of(context).pop(),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.arrow_back_ios_new, size: 18, color: ink500),
            const SizedBox(width: 2),
            Text('返回', style: TextStyle(color: ink500, fontSize: 14)),
          ],
        ),
      ),
    );
  }
}
