import 'package:flutter/material.dart';
import '../home_page.dart';
import 'app_floating_button.dart';

/// 左上角「回家」悬浮钮（40×40 r20），回到首页并清空导航栈。
///
/// 仅在子页显示；首页自身不显示（首页用其自有顶部布局，见 PRD §3.2/§3.3）。
class HomeButton extends StatelessWidget {
  const HomeButton({super.key});

  @override
  Widget build(BuildContext context) {
    return AppFloatingButton(
      icon: const Text('🏠', style: TextStyle(fontSize: 20)),
      onPressed: () => Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const HomePage()),
        (route) => false,
      ),
    );
  }
}
