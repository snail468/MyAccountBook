import 'package:flutter/material.dart';
import '../settings_page.dart';
import 'app_floating_button.dart';
import 'appearance_sheet.dart';

/// 右上角悬浮工具条：眼睛（打开外观快捷面板）+ 设置。
///
/// [mode] 区分主页与子页：
///  - [ToolbarMode.home]：眼睛 + ✨（设置页入口）；
///  - [ToolbarMode.subpage]（默认）：眼睛 + ⚙️（设置页入口）。
/// 各钮 40×40、圆角 20，令牌化填充/描边（见 [AppFloatingButton]）。
class FloatingToolbar extends StatelessWidget {
  final ToolbarMode mode;

  const FloatingToolbar({super.key, this.mode = ToolbarMode.subpage});

  @override
  Widget build(BuildContext context) {
    final isHome = mode == ToolbarMode.home;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        AppFloatingButton(
          icon: const Text('👁', style: TextStyle(fontSize: 20)),
          onPressed: () => showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            builder: (_) => const AppearanceSheet(),
          ),
        ),
        const SizedBox(width: 10),
        AppFloatingButton(
          icon: Text(isHome ? '✨' : '⚙️',
              style: const TextStyle(fontSize: 20)),
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const SettingsPage()),
          ),
        ),
      ],
    );
  }
}

/// 悬浮工具条模式：主页用眼睛 + ✨，子页用眼睛 + ⚙️（默认）。
enum ToolbarMode { home, subpage }
