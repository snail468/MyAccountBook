import 'dart:async';
import 'dart:convert';
import 'package:uuid/uuid.dart';

import '../core/constants.dart';
import '../core/exceptions.dart';
import '../api/api_client.dart';
import '../api/ledger_api.dart';
import '../api/general_entry_api.dart';
import '../api/work_entry_api.dart';
import '../api/event_api.dart';
import '../api/trip_api.dart';
import '../data/models/ledger.dart';
import '../data/models/general_entry.dart';
import '../data/models/work_entry.dart';
import '../data/models/taoyuan_event.dart';
import '../data/models/trip.dart';
import '../data/local/ledger_dao.dart';
import '../data/local/general_entry_dao.dart';
import '../data/local/work_entry_dao.dart';
import '../data/local/event_dao.dart';
import '../data/local/trip_dao.dart';
import '../data/local/pending_op_dao.dart';
import '../data/models/pending_op.dart';
import 'connectivity.dart';

/// 离线优先的同步引擎。
///
/// 写路径：UI 先把数据落本地库（乐观更新），再 [enqueue] 一条待同步操作。
/// 联网时 [syncAll] 先 [drainQueue] 把本地改动推上去，再 [pullAll] 从服务端全量拉回、
/// 按 server_id 覆盖本地（未同步的本地行被保留，不会被覆盖）。
///
/// 关键约定：本地 `id` 永远是本地 UUID，`server_id` 存服务端 cuid（同步前为 null）。
class SyncService {
  SyncService._internal();
  static final SyncService instance = SyncService._internal();

  final _uuid = const Uuid();
  final ApiClient _api = ApiClient.instance;
  final Connectivity _conn = Connectivity.instance;

  final LedgerApi _ledgers = LedgerApi(ApiClient.instance);
  final GeneralEntryApi _general = GeneralEntryApi(ApiClient.instance);
  final WorkEntryApi _work = WorkEntryApi(ApiClient.instance);
  final EventApi _events = EventApi(ApiClient.instance);
  final TripApi _trip = TripApi(ApiClient.instance);

  final LedgerDao _ledgerDao = LedgerDao();
  final GeneralEntryDao _generalDao = GeneralEntryDao();
  final WorkEntryDao _workDao = WorkEntryDao();
  final EventDao _eventDao = EventDao();
  final TripDao _tripDao = TripDao();
  final PendingOpDao _opDao = PendingOpDao();

  bool _syncing = false;

  // ---------------- 入队 ----------------

  /// 入队一条写操作（POST/PUT/PATCH/DELETE）。
  Future<void> enqueue({
    required String method,
    required String path,
    Map<String, dynamic>? body,
    String? clientId,
    required String entity,
    required String entityLocalId,
  }) async {
    await _opDao.enqueue(PendingOp(
      opUuid: _uuid.v4(),
      method: method,
      path: path,
      body: body == null ? null : jsonEncode(body),
      clientId: clientId,
      entity: entity,
      entityLocalId: entityLocalId,
      createdAt: DateTime.now().millisecondsSinceEpoch,
    ));
  }

  /// 仅删除某本地实体关联的待操作（用于"删除一条尚未同步的本地记录"，
  /// 此时服务端还不存在该记录，无需发 DELETE）。
  Future<void> removePendingFor(String entityLocalId) async {
    await _opDao.removePendingFor(entityLocalId);
  }

  /// 编辑未同步行：先清掉该本地实体的待操作，再入队新操作，避免重复 POST。
  Future<void> enqueueCoalesced({
    required String method,
    required String path,
    Map<String, dynamic>? body,
    String? clientId,
    required String entity,
    required String entityLocalId,
  }) async {
    await _opDao.removePendingFor(entityLocalId);
    await enqueue(
      method: method,
      path: path,
      body: body,
      clientId: clientId,
      entity: entity,
      entityLocalId: entityLocalId,
    );
  }

  Future<int> pendingCount() => _opDao.pendingCount();

  // ---------------- 同步主流程 ----------------

  /// 先推后拉。任何错误都会抛出去让调用方看到具体消息（不再静默吞掉）。
  Future<bool> syncAll() async {
    if (_syncing) return false;
    _syncing = true;
    try {
      // 先推（本地改动重放到服务端），再全量拉取。
      await drainQueue();
      await _pullAll();
      return true;
    } on ApiException catch (e) {
      if (e.code == 'unauthorized') {
        await _api.clearSession();
      }
      rethrow;
    } finally {
      _syncing = false;
    }
  }

  /// 只把队列里的操作重放掉（不拉取）。供连接恢复后后台触发。
  Future<void> drainQueue() async {
    final ops = await _opDao.listPending();
    for (final op in ops) {
      try {
        String? createdId;
        switch (op.method) {
          case 'POST':
            final resp = await _api.post(op.path, op.decodedBody);
            if (resp is Map && resp['id'] is String) createdId = resp['id'] as String;
            break;
          case 'PUT':
            await _api.put(op.path, op.decodedBody);
            break;
          case 'PATCH':
            await _api.patch(op.path, op.decodedBody);
            break;
          case 'DELETE':
            await _api.delete(op.path);
            break;
        }
        await _markLocalSynced(op, createdId);
        await _opDao.markDone(op.id!);
      } catch (e) {
        if (e is NetworkException || (e is ApiException && e.code == 'unauthorized')) {
          rethrow;
        }
        // 业务错误（4xx 校验等）：标记失败，避免无限重试
        await _opDao.markFailed(op.id!, op.attempts + 1);
      }
    }
  }

  Future<void> _markLocalSynced(PendingOp op, [String? serverId]) async {
    final localId = op.entityLocalId;
    if (localId == null) return;
    switch (op.entity) {
      case 'ledger':
        final cur = await _ledgerDao.getById(localId);
        final sid = serverId ?? cur?.serverId;
        if (sid != null && sid.isNotEmpty) await _ledgerDao.markSynced(localId, sid);
        break;
      case 'general_entry':
        final cur = await _generalDao.getById(localId);
        final sid = serverId ?? cur?.serverId;
        if (sid != null && sid.isNotEmpty) await _generalDao.markSynced(localId, sid);
        break;
      case 'work_entry':
        final cur = await _workDao.getById(localId);
        final sid = serverId ?? cur?.serverId;
        if (sid != null && sid.isNotEmpty) await _workDao.markSynced(localId, sid);
        break;
      case 'event':
        final cur = await _eventDao.getById(localId);
        final sid = serverId ?? cur?.serverId;
        if (sid != null && sid.isNotEmpty) await _eventDao.markEventSynced(localId, sid);
        break;
      case 'trip_member':
        final cur = await _tripDao.getMemberById(localId);
        final sid = serverId ?? cur?.serverId;
        if (sid != null && sid.isNotEmpty) await _tripDao.markMemberSynced(localId, sid);
        break;
      case 'trip_expense':
        final sid = serverId; // 花费行在 enqueue 时已是 synced，无需查
        if (sid != null && sid.isNotEmpty) await _tripDao.markExpenseSynced(localId, sid);
        break;
    }
  }

  // ---------------- 拉取 ----------------

  Future<void> _pullAll() async {
    final ledgers = await _ledgers.list();
    final ledgerServerToLocal = <String, String>{};
    for (final j in ledgers) {
      final sid = j['id'] as String;
      final localId = ledgerServerToLocal[sid] ?? _uuid.v4();
      await _ledgerDao.upsert(Ledger.fromApi(j, localId: localId));
      ledgerServerToLocal[sid] = localId;
    }

    for (final j in ledgers) {
      final sid = j['id'] as String;
      final localId = ledgerServerToLocal[sid]!;
      final kind = j['kind'] as String;
      if (kind == AppConfig.kindGeneral) {
        await _pullGeneral(localId, sid);
      } else if (kind == AppConfig.kindWork) {
        await _pullWork(localId, sid);
      } else if (kind == AppConfig.kindTaoyuan) {
        await _pullTaoyuan(localId, sid);
      } else if (kind == AppConfig.kindTravel) {
        await _pullTravel(localId, sid);
      }
    }

    // 账本级对账：服务端已删除的账本（含其全部本地子数据）清理掉。
    final ledgerServerIds = <String>{for (final j in ledgers) j['id'] as String};
    await _ledgerDao.deleteSyncedNotIn(ledgerServerIds);
  }

  Future<void> _pullGeneral(String ledgerId, String serverLedgerId) async {
    final entries = await _general.list(serverLedgerId);
    final existing = await _generalDao.listByLedger(ledgerId);
    final map = <String, String>{};
    for (final e in existing) {
      if (e.serverId != null) map[e.serverId!] = e.id;
    }
    for (final j in entries) {
      final sid = j['id'] as String;
      final localId = map[sid] ?? _uuid.v4();
      await _generalDao.insert(GeneralEntry.fromApi(j, ledgerId, localId: localId));
    }

    // 对账：删本地已同步但服务端已软删的行（未同步的本地新建保留）。
    final serverIds = <String>{for (final j in entries) j['id'] as String};
    await _generalDao.deleteSyncedNotIn(ledgerId, serverIds);
  }

  Future<void> _pullWork(String ledgerId, String serverLedgerId) async {
    final entries = await _work.list(serverLedgerId);
    final existing = await _workDao.listByLedger(ledgerId);
    final map = <String, String>{};
    for (final e in existing) {
      if (e.serverId != null) map[e.serverId!] = e.id;
    }
    for (final j in entries) {
      final sid = j['id'] as String;
      final localId = map[sid] ?? _uuid.v4();
      await _workDao.insert(WorkEntry.fromApi(j, ledgerId, localId: localId));
    }

    // 对账：删本地已同步但服务端已软删的行（未同步的本地新建保留）。
    final serverIds = <String>{for (final j in entries) j['id'] as String};
    await _workDao.deleteSyncedNotIn(ledgerId, serverIds);
  }

  Future<void> _pullTaoyuan(String ledgerId, String serverLedgerId) async {
    final events = await _events.list(serverLedgerId);
    final existing = await _eventDao.listByLedger(ledgerId);
    final map = <String, String>{};
    for (final e in existing) {
      if (e.serverId != null) map[e.serverId!] = e.id;
    }
    for (final j in events) {
      final sid = j['id'] as String;
      final localId = map[sid] ?? _uuid.v4();
      await _eventDao.insertEvent(TaoyuanEvent.fromApi(j, ledgerId, localId: localId));
      // 金额明细：清旧重建
      final detail = await _events.getById(sid);
      final amounts = (detail['amounts'] as List? ?? []);
      await _eventDao.deleteAmountsByEvent(localId);
      for (final a in amounts) {
        await _eventDao.insertAmount(
          EventAmount.fromApi(a as Map<String, dynamic>, localId, localId: _uuid.v4()),
        );
      }
    }

    // 对账：删本地已同步但服务端已软删的活动（金额级联清理由 DAO 处理）。
    final serverIds = <String>{for (final j in events) j['id'] as String};
    await _eventDao.deleteSyncedNotIn(ledgerId, serverIds);
  }

  Future<void> _pullTravel(String ledgerId, String serverLedgerId) async {
    // 成员先拉，建立 serverId -> localId
    final members = await _trip.listMembers(serverLedgerId);
    final existingMembers = await _tripDao.listMembers(ledgerId);
    final memberMap = <String, String>{};
    for (final m in existingMembers) {
      if (m.serverId != null) memberMap[m.serverId!] = m.id;
    }
    for (final j in members) {
      final sid = j['id'] as String;
      final localId = memberMap[sid] ?? _uuid.v4();
      await _tripDao.insertMember(tripMemberFromApi(j, ledgerId, localId: localId));
      memberMap[sid] = localId;
    }

    // 花费 + 分摊
    final expenses = await _trip.listExpenses(serverLedgerId, all: true);
    final existingExp = await _tripDao.listExpenses(ledgerId);
    final expMap = <String, String>{};
    for (final e in existingExp) {
      if (e.serverId != null) expMap[e.serverId!] = e.id;
    }
    for (final j in expenses) {
      final sid = j['id'] as String;
      final localId = expMap[sid] ?? _uuid.v4();
      await _tripDao.insertExpense(tripExpenseFromApi(j, ledgerId, localId: localId));
      final splits = (j['splits'] as List? ?? []);
      await _tripDao.deleteSplitsForExpense(localId);
      for (final s in splits) {
        final sm = s as Map<String, dynamic>;
        final serverMember = sm['memberId'] as String;
        final localMember = memberMap[serverMember] ?? serverMember;
        await _tripDao.insertSplit(TripSplit(
          id: _uuid.v4(),
          expenseId: localId,
          serverId: sm['id'] as String?,
          memberId: localMember,
          shareCents: sm['shareCents'] as int,
        ));
      }
    }

    // 对账：成员与花费各自清理本地已同步但服务端已移除的行
    //（花费的分摊级联清理由 DAO 处理）。
    final memberServerIds = <String>{for (final j in members) j['id'] as String};
    await _tripDao.deleteSyncedMembersNotIn(ledgerId, memberServerIds);
    final expServerIds = <String>{for (final j in expenses) j['id'] as String};
    await _tripDao.deleteSyncedExpensesNotIn(ledgerId, expServerIds);
  }
}
