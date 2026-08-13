import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';
import '../api/auth_api.dart';
import '../sync/sync_service.dart';

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
  /// 当前登录用户角色（'admin' / 'user'）。来自登录响应，持久化到
  /// shared_preferences，重启后恢复。未登录/未取到时兜底为 'admin'，
  /// 避免老服务端(未返回 role)或首启瞬间把管理员误判成普通用户而丢失「用户管理」。
  /// 一旦服务端返回明确 'user'，即按普通用户限制（[#6]）。
  String? _role;

  /// 标记本次登录是否切换到了「不同的用户」（相对上次本地登录用户）。
  /// 登录流程据此在进首页前清空上一用户的本地数据，避免缓存串号 [#2]。
  bool _userSwitched = false;

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

  /// 角色。优先用服务端返回并持久化的真实角色；未取到(老服务端/首启)时兜底
  /// 'admin'，保证管理员权限不丢失。普通用户(role='user')将限制用户管理等管理动作。[#6]
  String get role => _role ?? 'admin';

  /// 记住的用户名（非空才可用于预填登录页）。
  String? get rememberedUsername => _rememberedUsername;

  static const String _kRememberUser = 'remember_username';
  static const String _kRememberPass = 'remember_password';
  static const String _kRememberRole = 'remember_role';
  static const String _kLastLocalUser = 'last_local_user';

  Future<void> init() async {
    _authed = await _api.hasSessionCookie();
    // 读取记住的凭据用于预填（不自动登录：cookie 失效需用户重新验证）。
    final prefs = await SharedPreferences.getInstance();
    _rememberedUsername = prefs.getString(_kRememberUser);
    _role = prefs.getString(_kRememberRole);
    // 预载记住的密码，使已登录会话（cookie 仍有效）进入银行卡页时解锁门可直接验密。
    _loginPassword = prefs.getString(_kRememberPass);
    // 启动恢复用户名：单用户应用里"记住的用户名"即当前登录用户。若不回填，
    // 重启后 [username] 为 null，首页头部「用户名 · 心愿便利贴」会显示空白。[#1]
    if (_authed) {
      _username = _rememberedUsername;
    }
    _initialized = true;
    notifyListeners();
  }

  Future<void> login(String username, String password) async {
    final data = await _auth.login(username, password);
    _username = data['username'] as String? ?? username;
    _role = _normalizeRole(data['role']);
    _authed = true;
    _loginPassword = password;
    // 持久化以便重启后仍可验密（与网页端无此 UI 不冲突，仅为本地解锁门服务）。
    await saveRememberMe(username, password);
    await _saveRole();
    // 检测是否切换到不同用户：是则在进首页前清空上一用户本地数据 [#2]
    final prefs = await SharedPreferences.getInstance();
    final prev = prefs.getString(_kLastLocalUser);
    _userSwitched = (prev != null && prev != _username);
    await prefs.setString(_kLastLocalUser, _username!);
    // 切换用户：在 notifyListeners()（触发 RootSwitcher 重建首页）【之前】先清空
    // 本地全部业务数据，确保首页首帧 s.load() 读到的是空库，而非上一用户的账本，
    // 彻底消除「同步中」时段闪现旧用户数据的串号问题 [#2]。
    if (_userSwitched) {
      await SyncService.instance.wipeLocalData();
    }
    notifyListeners();
  }

  /// 消费「切换用户」标记：返回 true 表示本次登录切换到了不同用户，
  /// 调用方据此清空本地全部业务数据并重置缓存。读取后清零，保证只触发一次 [#2]。
  bool consumeUserSwitch() {
    final v = _userSwitched;
    _userSwitched = false;
    return v;
  }

  /// 登录成功后，若用户勾选「记住登录信息」则保存明文凭据；否则清除已保存的密码。
  Future<void> saveRememberMe(String username, String password) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kRememberUser, username);
    await prefs.setString(_kRememberPass, password);
    _rememberedUsername = username;
  }

  /// 持久化角色（登录/注册成功后调用）。
  Future<void> _saveRole() async {
    final prefs = await SharedPreferences.getInstance();
    if (_role != null) {
      await prefs.setString(_kRememberRole, _role!);
    } else {
      await prefs.remove(_kRememberRole);
    }
  }

  /// 仅保留 'admin' / 'user'，其它一律视为普通用户（兜底安全）。
  String? _normalizeRole(dynamic r) {
    if (r == 'admin') return 'admin';
    if (r == 'user') return 'user';
    return null;
  }

  /// 清除记住的密码（保留用户名），用于未勾选或退出登录时。
  Future<void> clearRememberPassword() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kRememberPass);
    _rememberedUsername = prefs.getString(_kRememberUser);
  }

  Future<void> register(String username, String password) async {
    final data = await _auth.register(username, password);
    _username = data['username'] as String? ?? username;
    _role = _normalizeRole(data['role']);
    _authed = true;
    _loginPassword = password;
    await saveRememberMe(username, password);
    await _saveRole();
    final prefs = await SharedPreferences.getInstance();
    final prev = prefs.getString(_kLastLocalUser);
    _userSwitched = (prev != null && prev != _username);
    await prefs.setString(_kLastLocalUser, _username!);
    notifyListeners();
  }

  Future<void> logout() async {
    // 立即本地退出：清状态 + 清会话 Cookie + 通知，UI 立刻切到登录页，
    // 不等服务端响应（服务端可能在弱网/不可达时拖慢退出）[#1]。
    _authed = false;
    _username = null;
    _loginPassword = null;
    _role = null;
    // 退出登录时清除记住的密码（保留用户名，便于下次预填）。
    await clearRememberPassword();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kRememberRole);
    await _api.clearSession();
    notifyListeners();
    // 后台通知服务端销毁会话（失败不影响本地退出）。
    _auth.logoutServer().catchError((_) {});
  }
}
