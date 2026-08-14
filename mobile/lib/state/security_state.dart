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
  bool get requiredForBank =>
      _mode == BioLockMode.bank || _mode == BioLockMode.global;

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
