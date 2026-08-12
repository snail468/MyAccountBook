import 'api_client.dart';
import '../core/exceptions.dart';

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
  ///
  /// [D3] 预留路径：补 null 守卫，服务端未返 id 时抛明确异常而非崩溃。
  Future<String> create(Map<String, dynamic> body) async {
    final data = await _client.post('/cards', body);
    final id = data is Map ? data['id']?.toString() : null;
    if (id == null || id.isEmpty) {
      throw ApiException('创建银行卡失败：服务端未返回 id');
    }
    return id;
  }

  /// DELETE /api/cards/[id]。
  Future<void> delete(String id) async {
    await _client.delete('/cards/$id');
  }

  /// POST /api/cards/unlock —— 页面级解锁（验登录密码）。
  /// 成功后服务端会话解锁，随后 GET /api/cards 才会返回解密后的完整卡号 [#5]。
  Future<void> unlock(String password) async {
    await _client.post('/cards/unlock', {'password': password});
  }
}
