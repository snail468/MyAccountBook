import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../api/api_client.dart';
import '../api/trip_api.dart';
import '../data/local/trip_dao.dart';
import '../data/models/ledger.dart';
import '../data/models/trip.dart';
import '../sync/sync_service.dart';

const String _kExpenseEntity = 'trip_expense';

/// 旅游账本：成员 / 花费 / AA 结算。花费可离线记账（入队），成员管理需联网。
class TravelState extends ChangeNotifier {
  final TripDao _dao = TripDao();
  final TripApi _api = TripApi(ApiClient.instance);
  final SyncService _sync = SyncService.instance;
  Ledger _ledger;
  Ledger get ledger => _ledger;
  TravelState(Ledger ledger) : _ledger = ledger;

  /// 设置保存后回写账本元信息（本位币/起止日期/预算），触发刷新。
  void applyLedger(Ledger l) {
    _ledger = l;
    notifyListeners();
  }

  List<TripMember> _members = [];
  List<TripExpense> _expenses = [];
  final Map<String, List<TripSplit>> _splitsByExpense = {};

  List<TripMember> get members => _members;
  List<TripExpense> get expenses => _expenses;

  /// 每笔花费的分摊明细（花费 id -> 分摊列表），供页面展示「分摊」与趣味报告。
  Map<String, List<TripSplit>> get splitsByExpense => _splitsByExpense;

  Future<void> loadMembers() async {
    _members = await _dao.listMembers(ledger.id);
    notifyListeners();
  }

  Future<void> loadExpenses() async {
    _expenses = await _dao.listExpenses(ledger.id);
    _splitsByExpense.clear();
    for (final e in _expenses) {
      _splitsByExpense[e.id] = await _dao.listSplits(e.id);
    }
    notifyListeners();
  }

  Future<void> load() async {
    await loadMembers();
    await loadExpenses();
  }

  // ---- 成员（需联网）----

  Future<void> addMember({String? username, String? displayName}) async {
    await _api.addMember(ledger.serverId ?? ledger.id,
        username: username, displayName: displayName);
    await _refreshMembersFromServer();
  }

  Future<void> deleteMember(TripMember m) async {
    if (m.serverId == null) throw Exception('请先联网同步成员');
    await _api.deleteMember(ledger.serverId ?? ledger.id, m.serverId!);
    await _dao.deleteMember(m.id);
    await loadMembers();
  }

  Future<void> setSettled(TripMember m, bool settled) async {
    if (m.serverId == null) throw Exception('请先联网同步成员');
    await _api.setMemberSettled(ledger.serverId ?? ledger.id, m.serverId!, settled);
    await _dao.markMemberSettled(m.id, settled);
    await loadMembers();
  }

  Future<void> _refreshMembersFromServer() async {
    final members = await _api.listMembers(ledger.serverId ?? ledger.id);
    final existing = await _dao.listMembers(ledger.id);
    final map = <String, String>{};
    for (final m in existing) {
      if (m.serverId != null) map[m.serverId!] = m.id;
    }
    for (final j in members) {
      final sid = j['id'] as String;
      final localId = map[sid] ?? const Uuid().v4();
      await _dao.insertMember(tripMemberFromApi(j, ledger.id, localId: localId));
    }
    await loadMembers();
  }

  // ---- 花费（可离线）----

  Future<void> addExpense({
    required String payerLocalId,
    required String title,
    required String category,
    required String phase,
    required String currency,
    required int amountForeignCents,
    required double rate,
    required List<String> participantLocalIds,
    Map<String, int>? weights,
    String? note,
  }) async {
    if (participantLocalIds.isEmpty) throw Exception('请选择参与分摊的成员');
    final memberMap = <String, String?>{for (var m in _members) m.id: m.serverId};
    final payerServer = memberMap[payerLocalId];
    if (payerServer == null) throw Exception('付款人尚未同步，请先联网');
    final allocation = <Map<String, dynamic>>[];
    for (final pid in participantLocalIds) {
      final sid = memberMap[pid];
      if (sid == null) throw Exception('有成员尚未同步，请先联网');
      allocation.add({'memberId': sid, 'weight': weights != null ? (weights[pid] ?? 0) : 1});
    }

    final amountBaseCents = (amountForeignCents * rate).round();
    final now = DateTime.now();
    final e = TripExpense(
      id: const Uuid().v4(),
      ledgerId: ledger.id,
      payerId: payerLocalId,
      title: title,
      category: category,
      phase: phase,
      currency: currency,
      amountForeignCents: amountForeignCents,
      rate: rate,
      amountBaseCents: amountBaseCents,
      note: note,
      occurredAt: now.millisecondsSinceEpoch,
      synced: 0,
      clientId: const Uuid().v4(),
    );
    await _dao.insertExpense(e);

    // 本地按权重分摊（等额或按比例），联网同步后会被服务端权威值覆盖
    final ws = [for (final pid in participantLocalIds) weights != null ? (weights[pid] ?? 0) : 1];
    final shares = allocate(amountBaseCents, participantLocalIds, ws);
    for (final pid in participantLocalIds) {
      await _dao.insertSplit(TripSplit(
        id: const Uuid().v4(),
        expenseId: e.id,
        memberId: pid,
        shareCents: shares[pid] ?? 0,
      ));
    }

    await _sync.enqueue(
      method: 'POST',
      path: '/ledgers/${ledger.serverId ?? ledger.id}/expenses',
      body: {
        'payerId': payerServer,
        'title': title,
        'category': category,
        'phase': phase,
        'currency': currency,
        'amountForeignCents': amountForeignCents,
        'rate': rate,
        'note': note,
        'occurredAt': now.toUtc().toIso8601String(),
        'allocation': allocation,
        'clientId': e.clientId,
      },
      clientId: e.clientId,
      entity: _kExpenseEntity,
      entityLocalId: e.id,
    );
    await loadExpenses();
  }

  /// 编辑已有花费：重写花费行 + 重建分摊（先清后插），[weights] 为空则等额分摊。
  Future<void> updateExpense({
    required String expenseId,
    required String payerLocalId,
    required String title,
    required String category,
    required String phase,
    required String currency,
    required int amountForeignCents,
    required double rate,
    required List<String> participantLocalIds,
    Map<String, int>? weights,
    String? note,
    required int occurredAt,
  }) async {
    if (participantLocalIds.isEmpty) throw Exception('请选择参与分摊的成员');
    final idx = _expenses.indexWhere((e) => e.id == expenseId);
    if (idx < 0) return;
    final old = _expenses[idx];
    final amountBaseCents = (amountForeignCents * rate).round();
    final updated = TripExpense(
      id: old.id,
      ledgerId: old.ledgerId,
      serverId: old.serverId,
      payerId: payerLocalId,
      title: title,
      category: category,
      phase: phase,
      currency: currency,
      amountForeignCents: amountForeignCents,
      rate: rate,
      amountBaseCents: amountBaseCents,
      note: note,
      imageUrls: old.imageUrls,
      occurredAt: occurredAt,
      deletedAt: old.deletedAt,
      synced: 0,
      clientId: old.clientId,
    );
    await _dao.insertExpense(updated); // conflictAlgorithm.replace 覆盖原行
    await _dao.deleteSplitsForExpense(updated.id);
    final ws = [for (final pid in participantLocalIds) weights != null ? (weights[pid] ?? 0) : 1];
    final shares = allocate(amountBaseCents, participantLocalIds, ws);
    for (final pid in participantLocalIds) {
      await _dao.insertSplit(TripSplit(
        id: const Uuid().v4(),
        expenseId: updated.id,
        memberId: pid,
        shareCents: shares[pid] ?? 0,
      ));
    }
    if (updated.serverId != null) {
      final memberMap = <String, String?>{for (var m in _members) m.id: m.serverId};
      final allocation = <Map<String, dynamic>>[];
      var allSynced = true;
      for (final pid in participantLocalIds) {
        final sid = memberMap[pid];
        if (sid == null) {
          allSynced = false;
          break;
        }
        allocation.add({'memberId': sid, 'weight': weights != null ? (weights[pid] ?? 0) : 1});
      }
      if (allSynced) {
        await _sync.enqueue(
          method: 'PATCH',
          path:
              '/ledgers/${ledger.serverId ?? ledger.id}/expenses/${updated.serverId}',
          body: {
            'title': title,
            'category': category,
            'phase': phase,
            'currency': currency,
            'amountForeignCents': amountForeignCents,
            'rate': rate,
            'note': note,
            'occurredAt':
                DateTime.fromMillisecondsSinceEpoch(occurredAt).toUtc().toIso8601String(),
            'allocation': allocation,
          },
          entity: _kExpenseEntity,
          entityLocalId: updated.id,
        );
      }
    }
    await loadExpenses();
  }

  /// 检测历史数据分摊不守恒（sum(shares) != amountBaseCents），返回原因或 null。
  String? settlementError() {
    for (final e in _expenses) {
      if (e.deletedAt != null) continue;
      final sum = (_splitsByExpense[e.id] ?? const <TripSplit>[])
          .fold(0, (s, sp) => s + sp.shareCents);
      if (sum != e.amountBaseCents) {
        return '「${e.title}」(${e.category})：分摊合计 $sum 分 ≠ 总额 ${e.amountBaseCents} 分。'
            '逐笔打开「编辑」再保存一次即可修正。';
      }
    }
    return null;
  }

  Future<void> deleteExpense(TripExpense e) async {
    await _dao.softDeleteExpense(e.id);
    if (e.serverId != null) {
      await _sync.enqueue(
        method: 'DELETE',
        path: '/ledgers/${ledger.serverId ?? ledger.id}/expenses/${e.serverId}',
        entity: _kExpenseEntity,
        entityLocalId: e.id,
      );
    } else {
      await _sync.removePendingFor(e.id);
    }
    await loadExpenses();
  }

  /// AA 结算：返回谁该转给谁多少（本币分）。
  List<({String fromId, String toId, int amountCents})> settlement() {
    final paid = <String, int>{};
    final owed = <String, int>{};
    for (final e in _expenses) {
      if (e.deletedAt != null) continue;
      paid[e.payerId] = (paid[e.payerId] ?? 0) + e.amountBaseCents;
    }
    for (final e in _expenses) {
      if (e.deletedAt != null) continue;
      for (final TripSplit s in _splitsByExpense[e.id] ?? const <TripSplit>[]) {
        owed[s.memberId] = (owed[s.memberId] ?? 0) + s.shareCents;
      }
    }
    return TripDao.settle(paid, owed);
  }

  /// 各成员"净欠"（正=别人欠他，负=他欠别人），用于排序展示。
  Map<String, int> balances() {
    final paid = <String, int>{};
    final owed = <String, int>{};
    for (final e in _expenses) {
      if (e.deletedAt != null) continue;
      paid[e.payerId] = (paid[e.payerId] ?? 0) + e.amountBaseCents;
    }
    for (final e in _expenses) {
      if (e.deletedAt != null) continue;
      for (final TripSplit s in _splitsByExpense[e.id] ?? const <TripSplit>[]) {
        owed[s.memberId] = (owed[s.memberId] ?? 0) + s.shareCents;
      }
    }
    final ids = <String>{...paid.keys, ...owed.keys};
    return {for (final id in ids) id: (paid[id] ?? 0) - (owed[id] ?? 0)};
  }

  static List<int> _equalSplits(int total, int n) {
    if (n <= 0) return const [];
    final base = total ~/ n;
    var rem = total - base * n;
    return List.generate(n, (i) {
      final extra = rem > 0 ? 1 : 0;
      if (rem > 0) rem--;
      return base + extra;
    });
  }

  /// 按权重分摊 [total] 分，保证 sum(shares) == total（最大余数法）。
  static Map<String, int> allocate(
      int total, List<String> ids, List<int> weights) {
    final n = ids.length;
    if (n == 0) return const {};
    if (total == 0) return {for (final id in ids) id: 0};
    var totalW = 0;
    for (final w in weights) totalW += w;
    // 权重全为 0 时退化为等额
    final eff = totalW == 0 ? [for (final _ in ids) 1] : weights;
    if (totalW == 0) totalW = n;
    final raw = <double>[];
    final floor = <int>[];
    for (var i = 0; i < n; i++) {
      final r = total * eff[i] / totalW;
      raw.add(r);
      floor.add(r.floor());
    }
    var rem = total;
    for (final f in floor) rem -= f;
    final order = [for (var i = 0; i < n; i++) i]
      ..sort((a, b) => (raw[b] - floor[b]).compareTo(raw[a] - floor[a]));
    final result = <String, int>{};
    for (var i = 0; i < n; i++) result[ids[i]] = floor[i];
    for (var k = 0; k < rem && k < order.length; k++) {
      result[ids[order[k]]] = result[ids[order[k]]]! + 1;
    }
    return result;
  }
}
