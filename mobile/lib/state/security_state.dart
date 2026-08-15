import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 生物识别锁（指纹 / 面容）的作用范围。
enum BioLockMode {
  /// 关闭：不启用生物识别锁。
  off,
  /// 全局：进入应用（首页）前需验证，切回前台重新验证。
  global,
  /// 仅银行卡备份：进入银行卡页前需验证。
  bank,
  /// 指纹/面容登录 app：进入应用时用生物识别登录；登录后不再重复验证（银行卡页亦免）。
  login,
}

/// 安全设置（持久化到 shared_preferences）。
///
/// 生物识别仅作「解锁手段」，不替代登录密码：解锁成功后仍用本地记住的登录密码
/// 走服务端解锁（[BankPage] 的 _revealWithPassword），以取回完整卡号。
class SecurityState extends ChangeNotifier {
  static const String _kMode = 'bio_lock_mode';

  BioLockMode _mode = BioLockMode.off;
  BioLockMode get mode => _mode;

  /// 是否启用了生物识别锁（全局或仅银行卡）。
  bool get enabled => _mode != BioLockMode.off;

  /// 是否需要在进入银行卡页时验证。
  /// **仅在 [BioLockMode.bank] 时**：全局锁（global）下，整个 App 已被 [BioGate] 守卫，
  /// 银行卡页不应再弹一次指纹，否则会「双重指纹验证」[#2]。off 模式则完全不验。
  bool get requiredForBank => _mode == BioLockMode.bank;

  /// 银行卡页是否应跳过验密（无需单独验密码）：
  /// 全局锁 / 指纹登录下，进入 App 时已完成生物识别，银行卡备份无需再单独验密码 [#2][#3]。
  bool get bankSkipAuth =>
      _mode == BioLockMode.global || _mode == BioLockMode.login;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getString(_kMode);
    _mode = BioLockMode.values.firstWhere(
      (e) => e.name == v,
      orElse: () => BioLockMode.off,
    );
    notifyListeners();
  }

  Future<void> setMode(BioLockMode m) async {
    _mode = m;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kMode, m.name);
    notifyListeners();
  }
}
