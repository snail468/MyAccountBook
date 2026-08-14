import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/security_state.dart';
import 'biometric_service.dart';
import '../theme/design_tokens.dart';

/// 生物识别锁屏：未通过验证前显示锁定页，验证成功后展示 [child]。
///
/// [relockOnResume] 为 true 时（全局锁），应用从后台切回前台会重新要求验证 [#4]。
class BioGate extends StatefulWidget {
  final Widget child;
  final String reason;
  final bool relockOnResume;

  const BioGate({
    super.key,
    required this.child,
    required this.reason,
    this.relockOnResume = false,
  });

  @override
  State<BioGate> createState() => _BioGateState();
}

class _BioGateState extends State<BioGate> with WidgetsBindingObserver {
  bool _unlocked = false;
  bool _busy = false;
  bool _supported = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.relockOnResume) {
      WidgetsBinding.instance.addObserver(this);
    }
    _checkAndAuth();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (widget.relockOnResume && state == AppLifecycleState.resumed) {
      if (mounted) {
        setState(() => _unlocked = false);
        _checkAndAuth();
      }
    }
  }

  Future<void> _checkAndAuth() async {
    _supported = await BiometricService.canAuthenticate();
    if (!mounted) return;
    await _authenticate();
  }

  Future<void> _authenticate() async {
    if (!_supported) {
      if (mounted) {
        setState(() => _error = '本设备未启用指纹/面容，无法使用生物识别锁');
      }
      return;
    }
    if (mounted) setState(() => _busy = true);
    final ok = await BiometricService.authenticate(widget.reason);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _unlocked = ok;
      if (!ok) _error = '验证失败，请重试';
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_unlocked) return widget.child;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    return Scaffold(
      backgroundColor: pageBg,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('🔒', style: TextStyle(fontSize: 56)),
                const SizedBox(height: 16),
                Text('已锁定',
                    style: TextStyle(
                        color: ink900, fontSize: 20, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Text(widget.reason,
                    style: TextStyle(color: ink500, fontSize: 14),
                    textAlign: TextAlign.center),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    onPressed: _busy ? null : _authenticate,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: ink900,
                      foregroundColor:
                          isDark ? AppColors.darkCtaText : AppColors.lightSurface,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16)),
                    ),
                    child: _busy
                        ? const Text('验证中…',
                            style: TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w600))
                        : const Text('使用指纹/面容解锁',
                            style: TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w600)),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!,
                      style: TextStyle(color: red, fontSize: 13),
                      textAlign: TextAlign.center),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
