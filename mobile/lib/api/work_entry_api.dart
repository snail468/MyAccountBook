import 'api_client.dart';
import '../data/models/work_entry.dart';

/// 工作账本条目的服务端接口（POST 走 /api/entries，带 ledgerId）。
class WorkEntryApi {
  final ApiClient _client;
  WorkEntryApi(this._client);

  /// 列表（需显式 ledgerId 以命中协作账本）。增量同步用：[since] 为水线（ISO），
  /// null 表示全量；返回条目集合与 `incremental` 能力标志。
  Future<({List<Map<String, dynamic>> rows, bool incremental})> list(
    String ledgerId, {
    String? since,
  }) async {
    final all = <Map<String, dynamic>>[];
    String? cursor;
    bool incremental = false;
    do {
      final q = <String, String>{'ledgerId': ledgerId, 'limit': '200'};
      if (cursor != null) q['cursor'] = cursor;
      if (since != null) q['since'] = since;
      final data = await _client.get('/entries', query: q);
      if (data is Map && data['entries'] is List) {
        all.addAll(List<Map<String, dynamic>>.from(data['entries'] as List));
        incremental = data['incremental'] as bool? ?? incremental;
        cursor = data['nextCursor'] as String?;
      } else {
        break;
      }
    } while (cursor != null);
    return (rows: all, incremental: incremental);
  }

  /// 新建。返回服务端 id（cuid）。[e.clientId] 用于幂等。
  Future<String> create(WorkEntry e) async {
    final data = await _client.post('/entries', e.toApiBody());
    return (data['id'] as String);
  }

  /// 编辑（PATCH action=meta）。仅当本地行已同步时调用。
  Future<void> updateMeta(
    String entryId, {
    int? amountCents,
    String? note,
    String? category,
    String? direction,
    String? occurredAtIso,
  }) async {
    await _client.patch('/entries/$entryId', {
      'action': 'meta',
      if (amountCents != null) 'amountCents': amountCents,
      if (note != null) 'note': note,
      if (category != null) 'category': category,
      if (direction != null) 'direction': direction,
      if (occurredAtIso != null) 'occurredAt': occurredAtIso,
    });
  }

  /// 软删（进回收站）。
  Future<void> delete(String entryId) async {
    await _client.delete('/entries/$entryId');
  }
}
