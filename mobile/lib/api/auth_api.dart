import 'api_client.dart';

/// 鉴权相关接口。登录/注册成功后服务端通过 Set-Cookie 写入 `mab_session`，
/// [ApiClient] 的 CookieManager 自动持久化，后续请求自动带上。
class AuthApi {
  final ApiClient _client;

  AuthApi(this._client);

  /// 登录。会话靠 Cookie，不返回 token。返回服务端完整响应
  /// （含 username / role），供 [AuthState] 提取角色做权限判断。[#6]
  Future<Map<String, dynamic>> login(String username, String password) async {
    final data = await _client.post('/auth/login', {
      'username': username,
      'password': password,
    });
    if (data is Map) return Map<String, dynamic>.from(data);
    return {'username': username};
  }

  Future<Map<String, dynamic>> register(String username, String password) async {
    final data = await _client.post('/auth/register', {
      'username': username,
      'password': password,
    });
    if (data is Map) return Map<String, dynamic>.from(data);
    return {'username': username};
  }

  Future<void> logout() async {
    try {
      await _client.post('/auth/logout', null);
    } finally {
      await _client.clearSession();
    }
  }

  /// 修改密码（对齐网页端 ChangePasswordButton → PATCH /api/auth/password）。
  /// 成功后其它设备的会话会失效，需要重新登录；当前设备不受影响。
  Future<void> changePassword(String currentPassword, String newPassword) async {
    await _client.patch('/api/auth/password', {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
  }
}
