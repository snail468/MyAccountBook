import 'api_client.dart';

/// 账本相关接口。
class LedgerApi {
  final ApiClient _client;
  LedgerApi(this._client);

  /// 当前用户全部账本（用于本地库初始化/全量拉取）。
  Future<List<Map<String, dynamic>>> list() async {
    final data = await _client.get('/ledgers');
    if (data is Map && data['ledgers'] is List) {
      return List<Map<String, dynamic>>.from(data['ledgers'] as List);
    }
    return [];
  }

  Future<String> create(Map<String, dynamic> body) async {
    final data = await _client.post('/ledgers', body);
    return (data['id'] as String);
  }

  Future<Map<String, dynamic>> getById(String id) async {
    final data = await _client.get('/ledgers/$id');
    return Map<String, dynamic>.from(data as Map);
  }

  Future<void> update(String id, Map<String, dynamic> body) async {
    await _client.patch('/ledgers/$id', body);
  }

  Future<void> delete(String id) async {
    await _client.delete('/ledgers/$id');
  }
}
