import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/security_state.dart';
import '../state/auth_state.dart';
import '../ui/widgets/app_text_field.dart';
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
  /// 应用是否曾真正退到后台（而非本机生物识别弹窗自身导致的生命周期抖动）。
  /// 仅当 _backgrounded 为 true 且已解锁时，回到前台才重新上锁，避免验证通过
  /// 后弹窗关闭触发 resumed 又立刻重新验证的死循环 [#2]。
  bool _backgrounded = false;
  /// 是否正处于本机生物识别弹窗中。弹窗期间出现的 paused/inactive 是弹窗自身的
  /// 生命周期事件，不应记为「退到后台」，否则关掉弹窗的 resumed 会误触发重新上锁。
  bool _inAuthDialog = false;
  /// 是否切换到「使用密码」回退模式（生物识别不可用/用户主动切换）。
  bool _usePassword = false;
  final TextEditingController _pw = TextEditingController();
  String? _pwError;
  bool _pwBusy = false;

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
    _pw.dispose();
    super.dispose();
  }

  /// 用登录密码解锁（对齐银行卡解锁逻辑）：比对 [AuthState.loginPassword]。
  /// 应用解锁本就基于登录密码，非设备 PIN；密码键盘为字母+数字，可输入非数字字符。
  Future<void> _submitPassword() async {
    final input = _pw.text;
    if (input.isEmpty) {
      setState(() => _pwError = '请输入登录密码');
      return;
    }
    setState(() {
      _pwBusy = true;
      _pwError = null;
    });
    final stored = context.read<AuthState>().loginPassword;
    await Future<void>.delayed(const Duration(milliseconds: 200));
    if (!mounted) return;
    if (stored == null) {
      setState(() {
        _pwBusy = false;
        _pwError = '请先登录后再解锁';
      });
      return;
    }
    if (input != stored) {
      setState(() {
        _pwBusy = false;
        _pwError = '密码错误';
      });
      return;
    }
    setState(() {
      _pwBusy = false;
      _unlocked = true;
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!widget.relockOnResume) return;
    // 仅在确实退到后台（非本机生物识别弹窗）时标记 _backgrounded；
    // 验证通过、用户主动回到前台时才重新上锁 [#2]。
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      // 已解锁且确已退到后台（非生物识别弹窗自身）时立即上锁并重建，
      // 让退到后台前最后渲染的帧就是锁屏，回到前台不会闪现解锁态 [#2]。
      if (!_inAuthDialog && _unlocked) {
        _backgrounded = true;
        if (mounted) setState(() => _unlocked = false);
      }
    } else if (state == AppLifecycleState.resumed) {
      if (_backgrounded) {
        _backgrounded = false;
        // 若用户已切到「使用密码」回退，不自动弹生物识别，保留密码输入态。
        if (!_usePassword) _checkAndAuth();
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
    if (mounted) {
      setState(() {
        _busy = true;
        _inAuthDialog = true;
      });
    }
    final ok = await BiometricService.authenticate(widget.reason);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _inAuthDialog = false;
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
                if (_usePassword) ...[
                  AppTextField(
                    hint: '登录密码',
                    obscure: true,
                    controller: _pw,
                  ),
                  if (_pwError != null) ...[
                    const SizedBox(height: 8),
                    Text(_pwError!,
                        style: TextStyle(color: red, fontSize: 13),
                        textAlign: TextAlign.center),
                  ],
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _pwBusy ? null : _submitPassword,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: ink900,
                        foregroundColor: isDark
                            ? AppColors.darkCtaText
                            : AppColors.lightSurface,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16)),
                      ),
                      child: _pwBusy
                          ? const Text('验证中…',
                              style: TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.w600))
                          : const Text('解锁',
                              style: TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.w600)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => setState(() {
                      _usePassword = false;
                      _pwError = null;
                    }),
                    child: Text('使用指纹/面容解锁',
                        style: TextStyle(color: ink500, fontSize: 14)),
                  ),
                ] else ...[
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _busy ? null : _authenticate,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: ink900,
                        foregroundColor: isDark
                            ? AppColors.darkCtaText
                            : AppColors.lightSurface,
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
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => setState(() {
                      _usePassword = true;
                      _error = null;
                    }),
                    child: Text('使用密码',
                        style: TextStyle(color: ink500, fontSize: 14)),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
