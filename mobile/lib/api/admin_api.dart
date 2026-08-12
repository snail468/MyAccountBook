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
}
