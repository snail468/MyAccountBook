import 'package:flutter/material.dart';
import '../settings_page.dart';
import 'app_floating_button.dart';
import 'appearance_sheet.dart';

/// 右上角悬浮工具条：眼睛（打开外观快捷面板）+ 设置（进入设置页）。
///
/// 各钮 40×40、圆角 20，令牌化填充/描边（见 [AppFloatingButton]）。
/// 子页统一使用，与左上 [HomeButton] 构成三段式顶栏（PRD §3.3）。
class FloatingToolbar extends StatelessWidget {
  const FloatingToolbar({super.key});

  @override
  Widget build(BuildContext context) {
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
          icon: const Text('⚙️', style: TextStyle(fontSize: 20)),
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const SettingsPage()),
          ),
        ),
      ],
    );
  }
}
