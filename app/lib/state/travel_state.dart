import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
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
  final Ledger ledger;
  TravelState(this.ledger);

  List<TripMember> _members = [];
  List<TripExpense> _expenses = [];
  final Map<String, List<TripSplit>> _splitsByExpense = {};

  List<TripMember> get members => _members;
  List<TripExpense> get expenses => _expenses;

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
      allocation.add({'memberId': sid, 'weight': 1});
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

    // 乐观本地分摊（等额），联网同步后会被服务端权威值覆盖
    final shares = _equalSplits(amountBaseCents, participantLocalIds.length);
    for (var i = 0; i < participantLocalIds.length; i++) {
      await _dao.insertSplit(TripSplit(
        id: const Uuid().v4(),
        expenseId: e.id,
        memberId: participantLocalIds[i],
        shareCents: shares[i],
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
      for (final s in _splitsByExpense[e.id] ?? const []) {
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
      for (final s in _splitsByExpense[e.id] ?? const []) {
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
}
