import 'api_client.dart';
import '../data/models/taoyuan_event.dart';

/// 桃源账本活动（Event）及阶段金额的服务端接口。
class EventApi {
  final ApiClient _client;
  EventApi(this._client);

  /// 活动列表（按 ledgerId 拉某本桃源账本）。
  Future<List<Map<String, dynamic>>> list(String ledgerId) async {
    final data = await _client.get('/events', query: {'ledgerId': ledgerId});
    if (data is Map && data['events'] is List) {
      return List<Map<String, dynamic>>.from(data['events'] as List);
    }
    return [];
  }

  /// 新建活动。返回服务端 id（cuid）。[e.clientId] 用于幂等。
  Future<String> create(TaoyuanEvent e) async {
    final data = await _client.post('/events', e.toApiBody());
    return (data['id'] as String);
  }

  /// 详情（含各阶段金额 amounts）。同步金额用。
  Future<Map<String, dynamic>> getById(String id) async {
    final data = await _client.get('/events/$id');
    return Map<String, dynamic>.from(data as Map);
  }

  /// 编辑（PATCH action=meta）。
  Future<void> update(String id, Map<String, dynamic> fields) async {
    await _client.patch('/events/$id', {'action': 'meta', ...fields});
  }

  /// 软删（进回收站）。
  Future<void> delete(String id) async {
    await _client.delete('/events/$id');
  }

  /// 新增一条阶段金额（predicted/announced/paid）。返回服务端 amount id。
  /// [body] 形如 {stage, cents, quantity?, itemDesc?, note?, rewardMethod?, occurredAt?}
  Future<String> addAmount(String eventId, Map<String, dynamic> body) async {
    final data = await _client.post('/events/$eventId/amounts', body);
    return (data['id'] as String);
  }
}
