import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../state/theme_state.dart';
import '../theme/design_tokens.dart';

/// 全局「点击光效 / 音效」层（对齐网页端 previewFx + 点击声）。
///
/// 包在 [MaterialApp] 之外作为根：[Listener] 捕获任意点击，按 [ThemeState]
/// 的开关决策：
///  - 光效开启：在点击坐标处播一段品牌粉涟漪（星空风格，scale + 渐隐）；
///  - 音效开启：用系统点击声 [SystemSound]，无需打包音频资源。
///
/// 涟漪用 [IgnorePointer] 包住，只渲染不拦截手势；坐标用全局逻辑像素，
/// 与根 [Stack] 左上角对齐，点击处即涟漪处 [#4]。
class ClickFxLayer extends StatefulWidget {
  final Widget child;
  const ClickFxLayer({super.key, required this.child});

  @override
  State<ClickFxLayer> createState() => _ClickFxLayerState();
}

class _ClickFxLayerState extends State<ClickFxLayer>
    with TickerProviderStateMixin {
  final List<_Ripple> _ripples = [];

  @override
  void dispose() {
    for (final r in _ripples) r.controller.dispose();
    super.dispose();
  }

  void _onPointerDown(PointerDownEvent e) {
    // 点击瞬间读取最新开关（本层不监听 ThemeState，避免无谓重建）。
    final ts = context.read<ThemeState>();
    if (ts.effectOn) _spawnRipple(e.position);
    if (ts.soundOn) _playSound();
  }

  void _spawnRipple(Offset pos) {
    final c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 650),
    );
    final r = _Ripple(position: pos, controller: c);
    setState(() => _ripples.add(r));
    c.forward().whenComplete(() {
      if (mounted) setState(() => _ripples.remove(r));
    });
  }

  void _playSound() {
    // 系统点击声：零资源依赖，开启音效即有反馈（对齐网页端「首页/其它页不同声」
    // 的精神——此处统一用 click，轻量无副作用）。
    SystemSound.play(SystemSoundType.click).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: _onPointerDown,
      child: Stack(
        children: [
          widget.child,
          for (final r in _ripples) _RippleWidget(ripple: r),
        ],
      ),
    );
  }
}

/// 单次涟漪：坐标 + 动画控制器。
class _Ripple {
  final Offset position;
  final AnimationController controller;
  _Ripple({required this.position, required this.controller});
}

/// 在点击坐标处渲染的扩散涟漪（IgnorePointer，不拦截手势）。
class _RippleWidget extends StatelessWidget {
  final _Ripple ripple;
  const _RippleWidget({required this.ripple});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = isDark ? AppColors.darkBrandPink : AppColors.lightBrandPink;
    final anim = ripple.controller;
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: anim,
        builder: (_, __) {
          final t = anim.value; // 0 → 1
          final size = 16 + t * 120; // 由小变大
          return Positioned(
            left: ripple.position.dx - size / 2,
            top: ripple.position.dy - size / 2,
            child: Opacity(
              opacity: (1 - t).clamp(0.0, 1.0),
              child: Container(
                width: size,
                height: size,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      accent.withOpacity(0.5),
                      accent.withOpacity(0.0),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
