import 'api_client.dart';

/// 管理员相关服务端接口（用户管理）。[#6]
class AdminApi {
  final ApiClient _client;
  AdminApi(this._client);

  /// GET /api/admin/users -> { users:[{ id, username, role, joinedAt }] }。
  ///
  /// 返回服务端全部用户；异常（离线/非管理员/401）由调用方捕获后降级到本地数据。
  Future<List<Map<String, dynamic>>> listUsers() async {
    final data = await _client.get('/admin/users');
    if (data is Map && data['users'] is List) {
      return List<Map<String, dynamic>>.from(data['users'] as List);
    }
    return const [];
  }

  /// POST /api/admin/users -> 新建用户（服务端落库，全量用户可见）。
  Future<void> createUser(String username, String password, String role) async {
    await _client.post('/admin/users', {
      'username': username,
      'password': password,
      'role': role,
    });
  }

  /// PATCH /api/admin/users/[id] -> 修改角色（'admin' | 'user'）。
  Future<void> setRole(String id, String role) async {
    await _client.patch('/admin/users/$id', {'role': role});
  }

  /// PATCH /api/admin/users/[id] -> 重置密码（强制对方下线）。
  Future<void> resetPassword(String id, String newPassword) async {
    await _client.patch('/admin/users/$id', {'password': newPassword});
  }

  /// DELETE /api/admin/users/[id] -> 删除用户（连带其账本数据）。
  Future<void> deleteUser(String id) async {
    await _client.delete('/admin/users/$id');
  }
}
