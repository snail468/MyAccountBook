import 'api_client.dart';
import '../core/exceptions.dart';

/// 周期记账规则服务端接口。
///
/// 范围：[D1] 本期只做拉取(PULL) + 删除推送(DELETE) + 停用/仅提醒切换推送(PATCH
/// active/autoCreate)。新增规则(POST) 预留、本期不调用。
class RecurringApi {
  final ApiClient _client;
  RecurringApi(this._client);

  /// GET /api/recurring -> { rules:[...] }。
  Future<List<Map<String, dynamic>>> list() async {
    final data = await _client.get('/recurring');
    if (data is Map && data['rules'] is List) {
      return List<Map<String, dynamic>>.from(data['rules'] as List);
    }
    return const [];
  }

  /// POST /api/recurring -> { ok, id }（本期不使用，预留）。[D1]
  ///
  /// 预留路径：补 null 守卫，服务端未返 id 时抛明确异常而非崩溃。
  Future<String> create(Map<String, dynamic> body) async {
    final data = await _client.post('/recurring', body);
    final id = data is Map ? data['id']?.toString() : null;
    if (id == null || id.isEmpty) {
      throw ApiException('创建周期规则失败：服务端未返回 id');
    }
    return id;
  }

  /// PATCH /api/recurring/[id] -> { ok }（active? / autoCreate? / 其它字段预留）。
  Future<void> update(String id, Map<String, dynamic> body) async {
    await _client.patch('/recurring/$id', body);
  }

  /// DELETE /api/recurring/[id]。
  Future<void> delete(String id) async {
    await _client.delete('/recurring/$id');
  }

  /// POST /api/recurring?run=1 -> 立即跑一次 materializeDueRules（生成到期账）。
  Future<void> runDue() async {
    await _client.request('POST', '/recurring', query: {'run': '1'});
  }
}
