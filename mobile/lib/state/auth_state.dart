import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';
import '../api/auth_api.dart';

/// 登录态。Cookie 由 [ApiClient] 持久化，这里只维护内存态 + 启动探测。
///
/// 「记住登录信息」：用户名与密码明文存入 shared_preferences（移动端本地存储，
/// 对应网页端 localStorage）。出于安全考虑，启动探测到 cookie 已失效时**不**自动登录，
/// 仅把记住的用户名预填到登录页（需用户重新输入密码验证）。
class AuthState extends ChangeNotifier {
  final ApiClient _api = ApiClient.instance;
  final AuthApi _auth = AuthApi(ApiClient.instance);

  bool _initialized = false;
  bool _authed = false;
  String? _username;

  /// 记住的用户名（启动探测后填充，供登录页预填）。
  String? _rememberedUsername;

  /// 登录密码（内存态，供银行卡解锁门验密用，对齐网页端 CardsUnlockGate
  /// 要求输入登录密码）。登录/注册时写入，启动探测若存有记住的密码也预载；
  /// 退出登录清空。不主动写磁盘以外的额外副本（saveRememberMe 已落 shared_preferences）。
  String? _loginPassword;

  bool get initialized => _initialized;
  bool get authed => _authed;
  String? get username => _username;

  /// 登录密码（供银行卡解锁门验密；为空说明尚未登录，需先登录）。
  String? get loginPassword => _loginPassword;

  /// 角色。网页端从会话读 `user.role`；本地优先单用户应用等价于管理员
  /// （拥有全部账本与数据），故固定为 'admin'，让首页「用户管理」卡片可见。
  String get role => 'admin';

  /// 记住的用户名（非空才可用于预填登录页）。
  String? get rememberedUsername => _rememberedUsername;

  static const String _kRememberUser = 'remember_username';
  static const String _kRememberPass = 'remember_password';

  Future<void> init() async {
    _authed = await _api.hasSessionCookie();
    // 读取记住的凭据用于预填（不自动登录：cookie 失效需用户重新验证）。
    final prefs = await SharedPreferences.getInstance();
    _rememberedUsername = prefs.getString(_kRememberUser);
    // 预载记住的密码，使已登录会话（cookie 仍有效）进入银行卡页时解锁门可直接验密。
    _loginPassword = prefs.getString(_kRememberPass);
    _initialized = true;
    notifyListeners();
  }

  Future<void> login(String username, String password) async {
    _username = await _auth.login(username, password);
    _authed = true;
    _loginPassword = password;
    // 持久化以便重启后仍可验密（与网页端无此 UI 不冲突，仅为本地解锁门服务）。
    await saveRememberMe(username, password);
    notifyListeners();
  }

  /// 登录成功后，若用户勾选「记住登录信息」则保存明文凭据；否则清除已保存的密码。
  Future<void> saveRememberMe(String username, String password) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kRememberUser, username);
    await prefs.setString(_kRememberPass, password);
    _rememberedUsername = username;
  }

  /// 清除记住的密码（保留用户名），用于未勾选或退出登录时。
  Future<void> clearRememberPassword() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kRememberPass);
    _rememberedUsername = prefs.getString(_kRememberUser);
  }

  Future<void> register(String username, String password) async {
    _username = await _auth.register(username, password);
    _authed = true;
    _loginPassword = password;
    await saveRememberMe(username, password);
    notifyListeners();
  }

  Future<void> logout() async {
    await _auth.logout();
    _authed = false;
    _username = null;
    _loginPassword = null;
    // 退出登录时清除记住的密码（保留用户名，便于下次预填）。
    await clearRememberPassword();
    notifyListeners();
  }
}
