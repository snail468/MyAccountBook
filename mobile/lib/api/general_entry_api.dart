import 'api_client.dart';
import '../data/models/general_entry.dart';

/// 普通账本条目的服务端接口。
class GeneralEntryApi {
  final ApiClient _client;
  GeneralEntryApi(this._client);

  /// 列表（按 occurredAt 倒序）。服务端游标分页，这里循环拉全量，
  /// 供同步对账使用——只有拿到完整集合，才能安全清理服务端已软删的本地行。
  Future<List<Map<String, dynamic>>> list(String ledgerId) async {
    final all = <Map<String, dynamic>>[];
    String? cursor;
    do {
      final q = <String, String>{'limit': '200'};
      if (cursor != null) q['cursor'] = cursor;
      final data = await _client.get('/ledgers/$ledgerId/entries', query: q);
      if (data is Map && data['entries'] is List) {
        all.addAll(List<Map<String, dynamic>>.from(data['entries'] as List));
        cursor = data['nextCursor'] as String?;
      } else {
        break;
      }
    } while (cursor != null);
    return all;
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
