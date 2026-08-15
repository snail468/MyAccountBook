import 'dart:async';
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
/// 涟漪层用 [Positioned.fill] + [Clip.none] 的全屏 overlay 渲染（必须 Clip.none，
/// 否则内部只有 Positioned 子项的 Stack 尺寸为 0×0 会把涟漪裁掉，导致点击无光效）。
/// [Listener] 用 [HitTestBehavior.translucent]：既接收全局点击、又不拦截子组件手势。
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
    // 用 route.isFirst 判「当前是否在根路由（首页）」：根路由 = 首页音效，
    // 其它路由（账本详情/银行卡/设置等）= global 音效。
    // 之前依赖 route.settings.name，但多数页是无名 MaterialPageRoute（name=null→'/'），
    // 导致全部路由映射成首页音效，全 app 都播同一段。isFirst 是 Route 原生属性，根路由唯一。
    clickFxRouteName.value = route.isFirst ? '/' : 'global';
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

class _ClickFxLayerState extends State<ClickFxLayer> {
  late final GlobalKey<_RippleOverlayState> _overlayKey;

  @override
  void initState() {
    super.initState();
    _overlayKey = GlobalKey<_RippleOverlayState>();
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      // translucent：既观察全局点击，又放行给子组件（按钮/滚动等照常工作）。
      // 涟漪层作为兄弟节点叠在最上方、整体 IgnorePointer，绝不拦截手势。
      behavior: HitTestBehavior.translucent,
      onPointerDown: (e) => _overlayKey.currentState?._onPointer(e),
      child: Stack(
        children: [
          widget.child,
          // Positioned.fill 让涟漪层铺满全屏（v2.0.85 验证过的渲染结构）：
          // v2.0.88 把涟漪层改成裸的非定位兄弟节点后变 0×0，光效看不见。
          // 恢复全屏 overlay，靠内部 Clip.none + Positioned 全局坐标渲染。
          Positioned.fill(child: _RippleOverlay(key: _overlayKey)),
        ],
      ),
    );
  }
}

/// 涟漪/音效渲染层：独立 [State]，其 [setState] 只重建本层、**绝不重建
/// [MaterialApp]**。
///
/// 关键修复（v2.0.88）：原实现把涟漪状态放在根层 [_ClickFxLayerState]，每次点击
/// 的 [setState] 会连带重建整个 App（含当前路由的 [MaterialApp]），在 pointer-down
/// 派发瞬间打断进行中的手势（按钮 onTap 的 down/up 配对被取消）→ 表现为「点击任何
/// 地方都无反应」。拆出独立层后，点击只重建涟漪层，手势不再受影响。
class _RippleOverlay extends StatefulWidget {
  const _RippleOverlay({super.key});

  @override
  State<_RippleOverlay> createState() => _RippleOverlayState();
}

class _RippleOverlayState extends State<_RippleOverlay>
    with TickerProviderStateMixin {
  final List<_Ripple> _ripples = [];
  int _seq = 0;

  void _onPointer(PointerDownEvent e) {
    final ts = context.read<ThemeState>();
    if (ts.effectOn) _spawnRipple(e.position);
    if (ts.soundOn) _playSound();
  }

  void _spawnRipple(Offset pos) {
    final c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    final r = _Ripple(id: _seq++, position: pos, controller: c);
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
    final isHome = clickFxRouteName.value == '/';
    _playOneShot(isHome ? 'audio/home.mp3' : 'audio/global.mp3');
  }

  /// 每次点击新建一个 [AudioPlayer] 播放并自动释放：避免复用同一播放器时
  /// 「已播放中无法从头重播」导致点击音效偶现/丢失的问题（对齐网页端每次点击
  /// 重新触发音频）；lowLatency 模式降低触发延迟 [#3]。
  void _playOneShot(String asset) {
    final player = AudioPlayer();
    var done = false;
    void release() {
      if (done) return;
      done = true;
      try {
        player.dispose();
      } catch (_) {
        // 忽略重复释放
      }
    }

    try {
      player.setPlayerMode(PlayerMode.lowLatency);
      player.onPlayerComplete.listen((_) => release());
      player.play(AssetSource(asset)).catchError((_) => release());
    } catch (_) {
      release();
    }
    // 安全兜底：3 秒后无论如何释放，避免异常时泄漏
    Timer(const Duration(seconds: 3), release);
  }

  @override
  void dispose() {
    for (final r in _ripples) r.controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // 整层 IgnorePointer：涟漪只做视觉，绝不拦截手势；Clip.none 保证不被 0×0
    // 尺寸裁掉（内部子项均为 Positioned，父 Stack 尺寸为 0×0，靠 Clip.none 透出）。
    return IgnorePointer(
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (final r in _ripples) _RippleWidget(ripple: r),
        ],
      ),
    );
  }
}

/// 单次涟漪：唯一 id + 坐标 + 动画控制器。
class _Ripple {
  final int id;
  final Offset position;
  final AnimationController controller;
  _Ripple({required this.id, required this.position, required this.controller});
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
        clipBehavior: Clip.none,
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
