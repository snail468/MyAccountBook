import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:audioplayers/audioplayers.dart';
import '../../state/theme_state.dart';

/// 全局「点击光效 / 音效」层（严格对齐网页端 src/components/ui/fx.ts）。
///
/// 包在 [MaterialApp] 之外作为根：[Listener] 捕获任意点击，按 [ThemeState]
/// 的开关决策：
///  - 光效开启：在点击坐标处播一段「星空涟漪」——紫色径向涟漪(rgba(139,109,208,0.7))
///    + 白色星芒(4 角星 burst)，scale 1→6、opacity 1→0、700ms cubic-bezier(0.16,1,0.3,1)。
///  - 音效开启：用 [AudioPlayer] 播放真实 mp3——首页路由用 home.mp3，其它页用 global.mp3
///    （对齐网页端两段音效；移动端点击即播，无需 Web Audio 的解锁手势）。
///
/// 涟漪用 [IgnorePointer] 包住，只渲染不拦截手势；坐标用全局逻辑像素，
/// 与根 [Stack] 左上角对齐，点击处即涟漪处。
class ClickFxLayer extends StatefulWidget {
  final Widget child;
  const ClickFxLayer({super.key, required this.child});

  @override
  State<ClickFxLayer> createState() => _ClickFxLayerState();
}

/// 当前路由名（首页为 '/'），用于区分 home / global 音效（对齐网页端 pathname==='/'）。
/// [MaterialApp.navigatorObservers] 里挂 [ClickFxRouteObserver] 来同步。
final ValueNotifier<String?> clickFxRouteName = ValueNotifier<String?>(null);

class ClickFxRouteObserver extends NavigatorObserver {
  void _update(Route<dynamic>? route) {
    if (route == null) return;
    final name = route.settings.name;
    // MaterialApp.home 的 route name 为 null，等价首页 '/'
    clickFxRouteName.value = (name == null || name == '/') ? '/' : name;
  }

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) => _update(route);

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) =>
      _update(newRoute);

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _update(previousRoute);
}

/// 试听：播放 global 音效（对齐网页端 previewFx 用 'global' 键）。
final AudioPlayer _previewPlayer = AudioPlayer();
Future<void> clickFxPreviewSound() async {
  try {
    await _previewPlayer.setPlayerMode(PlayerMode.lowLatency);
    await _previewPlayer.play(AssetSource('audio/global.mp3'));
  } catch (_) {
    // 资源缺失/解码失败：静默降级
  }
}

class _ClickFxLayerState extends State<ClickFxLayer> with TickerProviderStateMixin {
  final List<_Ripple> _ripples = [];

  // 两段音效播放器：lowLatency 模式支持快速重复播放，对齐网页端
  // 「每次点击 new 一个 source、不被上次播放头顶回后半段」。
  final AudioPlayer _homePlayer = AudioPlayer();
  final AudioPlayer _globalPlayer = AudioPlayer();
  bool _audioReady = false;

  @override
  void initState() {
    super.initState();
    _homePlayer.setPlayerMode(PlayerMode.lowLatency);
    _globalPlayer.setPlayerMode(PlayerMode.lowLatency);
    _preloadAudio();
  }

  Future<void> _preloadAudio() async {
    try {
      await _homePlayer.setSource(AssetSource('audio/home.mp3'));
      await _globalPlayer.setSource(AssetSource('audio/global.mp3'));
      _audioReady = true;
    } catch (_) {
      // 资源缺失/解码失败：静默降级为无音效
    }
  }

  void _onPointerDown(PointerDownEvent e) {
    final ts = context.read<ThemeState>();
    if (ts.effectOn) _spawnRipple(e.position);
    if (ts.soundOn) _playSound();
  }

  void _spawnRipple(Offset pos) {
    final c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    final r = _Ripple(position: pos, controller: c);
    setState(() => _ripples.add(r));
    c.forward().whenComplete(() {
      if (!mounted) {
        c.dispose();
        return;
      }
      setState(() => _ripples.remove(r));
      c.dispose();
    });
  }

  void _playSound() {
    if (!_audioReady) {
      // 还没预加载好：触发加载，本次不发声（对齐网页端 loadBuffer 后再播）
      _preloadAudio();
      return;
    }
    final isHome = clickFxRouteName.value == '/';
    final player = isHome ? _homePlayer : _globalPlayer;
    try {
      // lowLatency 下 play 自动从头重播（对齐网页端 start(0, offset)）
      player.play(AssetSource(isHome ? 'audio/home.mp3' : 'audio/global.mp3'));
    } catch (_) {
      // 忽略播放异常
    }
  }

  @override
  void dispose() {
    for (final r in _ripples) r.controller.dispose();
    _homePlayer.dispose();
    _globalPlayer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      // behavior 默认 deferToChild：只观察、不拦截手势
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

/// 缓动曲线，对齐网页端 cubic-bezier(0.16, 1, 0.3, 1)。
const Cubic _kEase = Cubic(0.16, 1, 0.3, 1);

/// 网页端紫色涟漪色 rgba(139,109,208,0.7) → Flutter 0xB3≈0.7 透明度。
const Color _kRippleColor = Color(0xB38B6DD0);

/// 在点击坐标处渲染的「星空涟漪」：紫色径向涟漪 + 白色星芒（对齐网页端 spawnRipple）。
/// [IgnorePointer] 不拦截手势。
class _RippleWidget extends StatelessWidget {
  final _Ripple ripple;
  const _RippleWidget({required this.ripple});

  @override
  Widget build(BuildContext context) {
    final anim = ripple.controller;
    final pos = ripple.position;
    return IgnorePointer(
      child: Stack(
        children: [
          // 紫色径向涟漪：基准 20px → scale 6（=120px），opacity 1→0
          AnimatedBuilder(
            animation: anim,
            builder: (_, __) {
              final e = _kEase.transform(anim.value);
              return Positioned(
                left: pos.dx - 10,
                top: pos.dy - 10,
                width: 20,
                height: 20,
                child: Transform.scale(
                  scale: 1 + e * 5,
                  child: Opacity(
                    opacity: (1 - anim.value).clamp(0.0, 1.0),
                    child: Container(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [_kRippleColor, _kRippleColor.withOpacity(0)],
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
          // 白色星芒：基准 12px → scale 3 + rotate 90deg，opacity 1→0
          AnimatedBuilder(
            animation: anim,
            builder: (_, __) {
              final e = _kEase.transform(anim.value);
              return Positioned(
                left: pos.dx - 6,
                top: pos.dy - 6,
                width: 12,
                height: 12,
                child: Transform.rotate(
                  angle: e * 1.5708,
                  child: Transform.scale(
                    scale: 1 + e * 2,
                    child: Opacity(
                      opacity: (1 - anim.value).clamp(0.0, 1.0),
                      child: CustomPaint(
                        size: const Size(12, 12),
                        painter: _SparklePainter(),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

/// 白色 4 角星（对齐网页端 clip-path 8 点星 polygon，0.9 透明度）。
class _SparklePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Color(0xE6FFFFFF) // rgba(255,255,255,0.9)
      ..style = PaintingStyle.fill;
    final cx = size.width / 2;
    final cy = size.height / 2;
    final h = size.width / 2;
    final inner = h * 0.2; // 网页端 0.1 偏离 = 半幅的 0.2
    final path = Path()
      ..moveTo(cx, cy - h)
      ..lineTo(cx + inner, cy - inner)
      ..lineTo(cx + h, cy)
      ..lineTo(cx + inner, cy + inner)
      ..lineTo(cx, cy + h)
      ..lineTo(cx - inner, cy + inner)
      ..lineTo(cx - h, cy)
      ..lineTo(cx - inner, cy - inner)
      ..close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
