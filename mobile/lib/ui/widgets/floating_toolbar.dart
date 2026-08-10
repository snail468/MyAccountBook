import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../state/theme_state.dart';
import 'app_floating_button.dart';
import 'appearance_sheet.dart';

/// 右上角悬浮工具条（对齐网页端 FloatingToolbar）。
///
/// - 眼睛：直接切换 [ThemeState.amountsVisible]（金额显隐），图标随状态变化
///   （[Icons.visibility] 开 / [Icons.visibility_off] 关）。
/// - 设置：打开外观面板（主题 / 风格 / 字号 / 光效 / 音效）。
///
/// [mode] 仅影响设置钮图标（主页 ✨，子页 ⚙️），行为一致。
class FloatingToolbar extends StatelessWidget {
  final ToolbarMode mode;

  const FloatingToolbar({super.key, this.mode = ToolbarMode.subpage});

  @override
  Widget build(BuildContext context) {
    final theme = context.watch<ThemeState>();
    final isHome = mode == ToolbarMode.home;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        AppFloatingButton(
          icon: Icon(
            theme.amountsVisible
                ? Icons.visibility
                : Icons.visibility_off,
            size: 20,
          ),
          onPressed: () => theme.toggleAmountsVisible(),
        ),
        const SizedBox(width: 10),
        AppFloatingButton(
          icon: Icon(
            isHome ? Icons.auto_awesome : Icons.settings,
            size: 20,
          ),
          onPressed: () => showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            builder: (_) => const AppearanceSheet(),
          ),
        ),
      ],
    );
  }
}

/// 悬浮工具条模式：主页用 ✨，子页用 ⚙️（默认）。
enum ToolbarMode { home, subpage }
