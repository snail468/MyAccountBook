import 'package:flutter/foundation.dart';
import '../api/api_client.dart';
import '../api/auth_api.dart';

/// 登录态。Cookie 由 [ApiClient] 持久化，这里只维护内存态 + 启动探测。
class AuthState extends ChangeNotifier {
  final ApiClient _api = ApiClient.instance;
  final AuthApi _auth = AuthApi(ApiClient.instance);

  bool _initialized = false;
  bool _authed = false;
  String? _username;

  bool get initialized => _initialized;
  bool get authed => _authed;
  String? get username => _username;

  Future<void> init() async {
    _authed = await _api.hasSessionCookie();
    _initialized = true;
    notifyListeners();
  }

  Future<void> login(String username, String password) async {
    _username = await _auth.login(username, password);
    _authed = true;
    notifyListeners();
  }

  Future<void> register(String username, String password) async {
    _username = await _auth.register(username, password);
    _authed = true;
    notifyListeners();
  }

  Future<void> logout() async {
    await _auth.logout();
    _authed = false;
    _username = null;
    notifyListeners();
  }
}
