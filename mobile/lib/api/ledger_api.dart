import 'api_client.dart';

/// 账本相关接口。
class LedgerApi {
  final ApiClient _client;
  LedgerApi(this._client);

  /// 当前用户全部账本（用于本地库初始化/全量拉取）。若服务端游标分页则循环拉全量。
  Future<List<Map<String, dynamic>>> list() async {
    final all = <Map<String, dynamic>>[];
    String? cursor;
    do {
      final q = <String, String>{'limit': '200'};
      if (cursor != null) q['cursor'] = cursor;
      final data = await _client.get('/ledgers', query: q);
      if (data is Map && data['ledgers'] is List) {
        all.addAll(List<Map<String, dynamic>>.from(data['ledgers'] as List));
        cursor = data['nextCursor'] as String?;
      } else {
        break;
      }
    } while (cursor != null);
    return all;
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
