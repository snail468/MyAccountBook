import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../state/theme_state.dart';
import '../../theme/design_tokens.dart';
import 'app_primary_button.dart';
import 'app_switch.dart';
import 'click_fx.dart';

/// 首页「外观」快捷面板（👁 浮动按钮入口），对齐设计稿 2:139。
///
/// 覆盖：主题模式 / 界面风格（默认 / 液态玻璃 双选项，均可选）/
/// 字号 / 点击光效开关 / 音效开关 + 试听 / 完成。所有改动即时写入
/// [ThemeState] 并持久化。试听按钮会预览当前「点击光效」涟漪（对齐网页端 previewFx）。
class AppearanceSheet extends StatelessWidget {
  const AppearanceSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final ts = context.watch<ThemeState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;

    // 界面风格：默认 / 液态玻璃 双选项，均可选（对齐 globals.css .liquid 液态玻璃主题）。
    final styleValue = ts.style;

    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).padding.bottom + 16,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('外观',
              style: TextStyle(
                  color: ink900, fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 14),
          Text('主题模式', style: TextStyle(color: ink500, fontSize: 13)),
          const SizedBox(height: 8),
          SegmentedButton<AppThemeMode>(
            segments: const [
              ButtonSegment(value: AppThemeMode.light, label: Text('白天')),
              ButtonSegment(value: AppThemeMode.dark, label: Text('黑夜')),
              ButtonSegment(value: AppThemeMode.system, label: Text('系统')),
            ],
            selected: {ts.themeMode},
            onSelectionChanged: (s) => ts.setThemeMode(s.first),
          ),
          const SizedBox(height: 16),
          Text('界面风格', style: TextStyle(color: ink500, fontSize: 13)),
          const SizedBox(height: 8),
          // 界面风格：默认(可选) + 液态玻璃(可选)
          Container(
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurface : AppColors.lightSurfaceSubtle,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                width: 1,
              ),
            ),
            child: Row(
              children: [
                _StyleChip(
                  label: '默认',
                  selected: styleValue == AppStyle.classic,
                  onTap: () => ts.setStyle(AppStyle.classic),
                ),
                _StyleChip(
                  label: '液态玻璃',
                  selected: styleValue == AppStyle.glass,
                  onTap: () => ts.setStyle(AppStyle.glass),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text('字号', style: TextStyle(color: ink500, fontSize: 13)),
          const SizedBox(height: 8),
          SegmentedButton<double>(
            segments: const [
              ButtonSegment(value: 0.9, label: Text('小')),
              ButtonSegment(value: 1.0, label: Text('标准')),
              ButtonSegment(value: 1.15, label: Text('大')),
            ],
            selected: {ts.fontScale},
            onSelectionChanged: (s) => ts.setFontScale(s.first),
          ),
          const SizedBox(height: 16),
          const Divider(height: 1),
          const SizedBox(height: 8),
          // 光效
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('点击光效',
                        style: TextStyle(
                            color: ink900,
                            fontSize: 15,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text('星空风格：紫色涟漪 + 星芒',
                        style: TextStyle(color: ink500, fontSize: 13)),
                  ],
                ),
              ),
              AppSwitch(
                value: ts.effectOn,
                onChanged: (v) => ts.setEffectOn(v),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Divider(height: 1),
          const SizedBox(height: 8),
          // 音效 + 试听
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('音效',
                        style: TextStyle(
                            color: ink900,
                            fontSize: 15,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text('首页用一段声，其它页面用另一段',
                        style: TextStyle(color: ink500, fontSize: 13)),
                  ],
                ),
              ),
              TextButton(
                onPressed: () => _previewClickFx(context, ts),
                child:
                    Text('试听', style: TextStyle(color: ink400, fontSize: 13)),
              ),
              AppSwitch(
                value: ts.soundOn,
                onChanged: (v) => ts.setSoundOn(v),
              ),
            ],
          ),
          const SizedBox(height: 16),
          AppPrimaryButton(
            label: '完成',
            onPressed: () => Navigator.of(context).pop(),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

/// 试听「点击光效」：对齐网页端 previewFx（light + sound）。
/// 先播 global 音效（修复"试听没声音"），再在屏幕中心播一段紫色星空涟漪。
void _previewClickFx(BuildContext context, ThemeState ts) {
  // 试听：播放 global 音效（对齐网页端 previewFx 用 'global' 键）
  clickFxPreviewSound();
  if (!ts.effectOn) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('点击光效已关闭，开启后试听可见涟漪')),
    );
    return;
  }
  final overlay = Overlay.of(context, rootOverlay: true);
  if (overlay == null) return;
  final entry = OverlayEntry(builder: (_) => const Center(child: _ClickRipple()));
  overlay.insert(entry);
  Future.delayed(const Duration(milliseconds: 760), () {
    try {
      entry.remove();
    } catch (_) {
      // 面板已关闭时忽略
    }
  });
}

/// 屏幕中心涟漪：紫色径向涟漪 + 白色星芒，scale 1→6、opacity 1→0
/// （对齐网页端 RIPPLE_SCALE/DURATION 与星芒 burst）。
class _ClickRipple extends StatefulWidget {
  const _ClickRipple();

  @override
  State<_ClickRipple> createState() => _ClickRippleState();
}

class _ClickRippleState extends State<_ClickRipple>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  late final Animation<double> _scale;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    )..forward();
    _scale = Tween<double>(begin: 1, end: 6).animate(
      CurvedAnimation(
        parent: _c,
        curve: const Cubic(0.16, 1, 0.3, 1),
      ),
    );
    _opacity = Tween<double>(begin: 1, end: 0).animate(_c);
  }

  @override
  void dispose() => _c.dispose();

  @override
  Widget build(BuildContext context) {
    // 对齐网页端：紫色径向涟漪 + 白色星芒（_scale 1→6）
    final e = (_scale.value - 1) / 5; // 0 → 1
    return Opacity(
      opacity: _opacity.value,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Transform.scale(
            scale: _scale.value,
            child: Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [_kPreviewRipple, _kPreviewRipple.withOpacity(0)],
                ),
              ),
            ),
          ),
          Transform.rotate(
            angle: e * 1.5708,
            child: Transform.scale(
              scale: 1 + e * 2,
              child: CustomPaint(
                size: const Size(12, 12),
                painter: _PreviewSparklePainter(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 网页端紫色涟漪色 rgba(139,109,208,0.7) → Flutter 0xB3≈0.7 透明度。
const Color _kPreviewRipple = Color(0xB38B6DD0);

/// 白色 4 角星（对齐网页端 clip-path 8 点星 polygon，0.9 透明度）。
class _PreviewSparklePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const paint = Paint()
      ..color = const Color(0xE6FFFFFF)
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

/// 界面风格选项 chip：默认 / 液态玻璃，均可选。
class _StyleChip extends StatelessWidget {
  final String label;
  final bool selected;
  final bool disabled;
  final String? badge;
  final VoidCallback? onTap;

  const _StyleChip({
    required this.label,
    this.selected = false,
    this.disabled = false,
    this.badge,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fg = disabled
        ? (isDark ? AppColors.darkInk500 : AppColors.lightInk400)
        : (selected
            ? (isDark ? AppColors.darkCtaText : Colors.white)
            : (isDark ? AppColors.darkInk100 : AppColors.lightInk900));
    final bg = selected && !disabled
        ? (isDark ? AppColors.darkCtaFill : AppColors.lightInk900)
        : Colors.transparent;
    final borderColor = disabled
        ? (isDark ? AppColors.darkBorder : AppColors.lightBorderDashed)
        : (selected
            ? Colors.transparent
            : (isDark ? AppColors.darkBorder : AppColors.lightBorder));
    return Expanded(
      child: GestureDetector(
        onTap: disabled ? null : onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: borderColor, width: 1),
          ),
          child: Center(
            child: Text(
              badge != null ? '$label · $badge' : label,
              style: TextStyle(
                color: fg,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
