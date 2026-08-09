import 'api_client.dart';

/// 银行卡相关服务端接口。
///
/// 仅消费未解锁路径的明文/尾号字段（[D2] 不调 unlock、不显完整卡号）。
/// CARD_SECRET 未配时 GET /api/cards 返 503（ApiClient 转 ApiException，
/// statusCode=503），由 [SyncService._pullCards] 非致命跳过。
class CardApi {
  final ApiClient _client;
  CardApi(this._client);

  /// GET /api/cards -> { unlocked, cards:[...] }；取 cards 数组。
  Future<List<Map<String, dynamic>>> list() async {
    final data = await _client.get('/cards');
    if (data is Map && data['cards'] is List) {
      return List<Map<String, dynamic>>.from(data['cards'] as List);
    }
    return const [];
  }

  /// POST /api/cards -> { ok, id, last4 }（本期不实际调用，预留）。[D1]
  Future<String> create(Map<String, dynamic> body) async {
    final data = await _client.post('/cards', body);
    return (data['id'] as String);
  }

  /// DELETE /api/cards/[id]。
  Future<void> delete(String id) async {
    await _client.delete('/cards/$id');
  }
}
