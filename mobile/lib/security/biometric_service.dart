import 'package:local_auth/local_auth.dart';

/// 生物识别封装：指纹 / 面容（具体方式由系统决定）。
///
/// 仅封装「能否验证」与「发起验证」两类调用，并吞掉底层异常，
/// 调用方据此降级（如回退到密码解锁）[#4]。
class BiometricService {
  static final LocalAuthentication _auth = LocalAuthentication();

  /// 设备是否支持生物识别且已录入凭证。
  static Future<bool> canAuthenticate() async {
    try {
      final can = await _auth.canCheckBiometrics;
      final supported = await _auth.isDeviceSupported();
      return can && supported;
    } catch (_) {
      return false;
    }
  }

  /// 弹出系统生物识别对话框；用户取消或失败返回 false。
  static Future<bool> authenticate(String reason) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}
