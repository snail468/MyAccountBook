import 'api_client.dart';
import '../data/models/general_entry.dart';

/// 普通账本条目的服务端接口。
class GeneralEntryApi {
  final ApiClient _client;
  GeneralEntryApi(this._client);

  /// 列表（增量同步用）。[since] 为上次拉取水线（ISO）；传 null 表示全量。
  /// 返回条目集合与 `incremental` 能力标志：为 true 时服务端只返回变更行，
  /// 调用方应做「增量应用」（upsert 变更 + 由 fromApi 写入软删），而非全量对账。
  Future<({List<Map<String, dynamic>> rows, bool incremental})> list(
    String ledgerId, {
    String? since,
  }) async {
    final all = <Map<String, dynamic>>[];
    String? cursor;
    bool incremental = false;
    do {
      final q = <String, String>{'limit': '200'};
      if (cursor != null) q['cursor'] = cursor;
      if (since != null) q['since'] = since;
      final data = await _client.get('/ledgers/$ledgerId/entries', query: q);
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
  Future<String> create(String ledgerId, GeneralEntry e) async {
    final data = await _client.post('/ledgers/$ledgerId/entries', e.toApiBody());
    return (data['id'] as String);
  }

  /// 编辑（PATCH）。仅当本地行已同步（有 serverId）时调用。
  Future<void> update(String ledgerId, String entryId, GeneralEntry e) async {
    await _client.patch('/ledgers/$ledgerId/entries/$entryId', {
      'direction': e.direction,
      'category': e.category,
      'amountCents': e.amountCents,
      'tags': e.tags,
      'note': e.note,
      'imageUrls': e.imageUrls,
      'occurredAt': DateTime.fromMillisecondsSinceEpoch(e.occurredAt)
          .toUtc()
          .toIso8601String(),
    });
  }

  /// 软删（进回收站）。
  Future<void> delete(String ledgerId, String entryId) async {
    await _client.delete('/ledgers/$ledgerId/entries/$entryId');
  }
}
