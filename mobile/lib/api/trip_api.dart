import 'api_client.dart';
import '../data/models/trip.dart';

/// 旅游账本：成员 / 花费 / 分摊的服务端接口。
class TripApi {
  final ApiClient _client;
  TripApi(this._client);

  /// 成员列表。
  Future<List<Map<String, dynamic>>> listMembers(String ledgerId) async {
    final data = await _client.get('/ledgers/$ledgerId/members');
    if (data is Map && data['members'] is List) {
      return List<Map<String, dynamic>>.from(data['members'] as List);
    }
    return [];
  }

  /// 新增成员：二选一 —— username（邀请已注册用户）或 displayName（纯名字占位）。
  Future<String> addMember(String ledgerId,
      {String? username, String? displayName}) async {
    final body = <String, dynamic>{};
    if (username != null && username.isNotEmpty) body['username'] = username;
    if (displayName != null && displayName.isNotEmpty) {
      body['displayName'] = displayName;
    }
    final data = await _client.post('/ledgers/$ledgerId/members', body);
    return (data['id'] as String);
  }

  /// 切换成员"已结清"标记。
  Future<void> setMemberSettled(
      String ledgerId, String memberId, bool settled) async {
    await _client.patch('/ledgers/$ledgerId/members/$memberId',
        {'settled': settled});
  }

  /// 删除成员（仅当无关联账目时服务端才允许）。
  Future<void> deleteMember(String ledgerId, String memberId) async {
    await _client.delete('/ledgers/$ledgerId/members/$memberId');
  }

  /// 花费列表。传 [all]=true 拉全量（结算统计用）；[since] 为增量水线（ISO）。
  /// 返回花费集合与 `incremental` 能力标志。
  Future<({List<Map<String, dynamic>> rows, bool incremental})> listExpenses(
    String ledgerId, {
    bool all = false,
    String? since,
  }) async {
    final q = <String, String>{};
    if (all) q['all'] = '1';
    if (since != null) q['since'] = since;
    final data = await _client.get(
      '/ledgers/$ledgerId/expenses',
      query: q.isNotEmpty ? q : null,
    );
    final rows = (data is Map && data['expenses'] is List)
        ? List<Map<String, dynamic>>.from(data['expenses'] as List)
        : <Map<String, dynamic>>[];
    final incremental = (data is Map ? data['incremental'] as bool? : null) ?? false;
    return (rows: rows, incremental: incremental);
  }

  /// 新增花费。[allocation] 为 [{memberId(服务端id), weight}]，由服务端用最大余额法
  /// 计算各成员应承担份额，保证守恒。[e.clientId] 用于幂等。返回服务端 expense id。
  Future<String> createExpense(
    String ledgerId,
    TripExpense e,
    List<Map<String, dynamic>> allocation,
  ) async {
    final body = {
      'payerId': e.payerId,
      'title': e.title,
      'category': e.category,
      'phase': e.phase,
      'currency': e.currency,
      'amountForeignCents': e.amountForeignCents,
      'rate': e.rate,
      'note': e.note,
      'imageUrls': e.imageUrls,
      'occurredAt': DateTime.fromMillisecondsSinceEpoch(e.occurredAt)
          .toUtc()
          .toIso8601String(),
      'allocation': allocation,
      if (e.clientId != null) 'clientId': e.clientId,
    };
    final data = await _client.post('/ledgers/$ledgerId/expenses', body);
    return (data['id'] as String);
  }

  /// 软删花费（进回收站）。
  Future<void> deleteExpense(String ledgerId, String expenseId) async {
    await _client.delete('/ledgers/$ledgerId/expenses/$expenseId');
  }
}
