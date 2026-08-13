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
import '../api/card_api.dart';
import '../api/recurring_api.dart';
import '../data/models/ledger.dart';
import '../data/models/general_entry.dart';
import '../data/models/work_entry.dart';
import '../data/models/taoyuan_event.dart';
import '../data/models/trip.dart';
import '../data/models/bank_card.dart';
import '../data/models/recurring_rule.dart';
import '../data/local/ledger_dao.dart';
import '../data/local/general_entry_dao.dart';
import '../data/local/work_entry_dao.dart';
import '../data/local/event_dao.dart';
import '../data/local/trip_dao.dart';
import '../data/local/bank_card_dao.dart';
import '../data/local/recurring_rule_dao.dart';
import '../data/local/pending_op_dao.dart';
import '../data/models/pending_op.dart';
import '../data/db/database.dart';
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
  final CardApi _cards = CardApi(ApiClient.instance);
  final RecurringApi _recurring = RecurringApi(ApiClient.instance);

  final LedgerDao _ledgerDao = LedgerDao();
  final GeneralEntryDao _generalDao = GeneralEntryDao();
  final WorkEntryDao _workDao = WorkEntryDao();
  final EventDao _eventDao = EventDao();
  final TripDao _tripDao = TripDao();
  final BankCardDao _bankDao = BankCardDao();
  final RecurringRuleDao _ruleDao = RecurringRuleDao();
  final PendingOpDao _opDao = PendingOpDao();

  bool _syncing = false;

  /// 清空本地全部业务数据（切换登录用户时调用，避免旧用户数据串号）[#2]。
  Future<void> wipeLocalData() async {
    await AppDatabase.instance.wipeAllData();
  }

  /// 仅拉取银行卡（解锁后/进入银行卡页时调用，此时服务端返回完整卡号）。
  ///
  /// 返回 null 表示成功；非 null 为失败原因（便于 UI 提示，而非静默吞掉）。
  /// 仍保持非致命：调用方不应因银行卡失败而中断整体流程 [#5]。
  Future<String?> pullBankCards() async {
    try {
      await _pullCards();
      return null;
    } on ApiException catch (e) {
      // 暴露真实错误：503=服务端未配置 CARD_SECRET；401=会话失效；其它=服务端异常 [#5]
      return e.message;
    } catch (e) {
      return e.toString();
    }
  }

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
      case 'bank_card':
        final cur = await _bankDao.getById(localId);
        final sid = serverId ?? cur?.serverId;
        if (sid != null && sid.isNotEmpty) await _bankDao.markSynced(localId, sid);
        break;
      case 'recurring_rule':
        final cur = await _ruleDao.getById(localId);
        final sid = serverId ?? cur?.serverId;
        if (sid != null && sid.isNotEmpty) await _ruleDao.markSynced(localId, sid);
        break;
    }
  }

  // ---------------- 拉取 ----------------

  Future<void> _pullAll() async {
    final ledgers = await _ledgers.list();

    // 防御：服务端响应里同一 server_id 理论上不会重复；若重复只取第一条，其余丢弃。
    final seenServerIds = <String>{};
    final deduped = <Map<String, dynamic>>[];
    for (final j in ledgers) {
      final sid = j['id'] as String;
      if (seenServerIds.contains(sid)) continue;
      seenServerIds.add(sid);
      deduped.add(j);
    }

    // 建立本地 server_id -> local_id 映射（来自持久化库，而非每次新建的临时 Map）。
    // 这样同一 server_id 的账本永远复用同一 local_id，配合 ledgers.server_id 唯一索引，
    // [LedgerDao.upsert] 的 ConflictAlgorithm.replace 会真正「更新」而非「插入新行」，
    // 从而根治「同步重复账本」Bug。map 基于 listAllIncludingDeleted，确保软删除过的
    // 账本也能被复用 local_id（否则新 UUID 写入会因唯一索引冲突而失败）。
    final localByServer = <String, String>{};
    final existing = await _ledgerDao.listAllIncludingDeleted();
    for (final l in existing) {
      if (l.serverId != null && l.serverId!.isNotEmpty) {
        localByServer[l.serverId!] = l.id;
      }
    }

    for (final j in deduped) {
      final sid = j['id'] as String;
      final localId = localByServer[sid] ?? _uuid.v4();
      await _ledgerDao.upsert(Ledger.fromApi(j, localId: localId));
      localByServer[sid] = localId;
    }

    // 逐账本拉取：单个账本失败（权限不足 / 服务端 5xx / 残留测试数据）不应拖垮整体同步。
    // 跳过失败账本、其余继续；仅当全部账本都拉取失败时才视为同步失败。
    int ok = 0;
    final errors = <String>[];
    for (final j in deduped) {
      final sid = j['id'] as String;
      final localId = localByServer[sid]!;
      final kind = j['kind'] as String;
      try {
        if (kind == AppConfig.kindGeneral) {
          await _pullGeneral(localId, sid);
        } else if (kind == AppConfig.kindWork) {
          await _pullWork(localId, sid);
        } else if (kind == AppConfig.kindTaoyuan) {
          await _pullTaoyuan(localId, sid);
        } else if (kind == AppConfig.kindTravel) {
          await _pullTravel(localId, sid);
        }
        ok++;
      } on ApiException catch (e) {
        errors.add('$sid($kind): ${e.message}');
      } on NetworkException {
        rethrow; // 离线则整体失败，让上层提示重连
      }
    }

    // 账本级对账：服务端已删除的账本（含其全部本地子数据）清理掉。
    final ledgerServerIds = <String>{for (final j in deduped) j['id'] as String};
    await _ledgerDao.deleteSyncedNotIn(ledgerServerIds);

    if (deduped.isNotEmpty && ok == 0) {
      final msg = errors.isNotEmpty ? errors.join('; ') : '未知同步错误';
      throw ApiException('同步失败（全部账本拉取出错）：$msg');
    }

    // 银行卡 / 周期规则：非致命拉取。仅 NetworkException 上抛中断整体 syncAll；
    // 其余（503 / 业务错误 / 解析失败）记日志跳过，绝不拖垮账本/规则同步。[D3]
    try {
      await _pullCards();
    } on NetworkException {
      rethrow;
    } catch (e) {
      // 非致命：银行卡同步失败不影响整体同步。
      // ignore: avoid_print
      print('银行卡同步失败（已跳过）：$e');
    }
    try {
      await _pullRecurring();
    } on NetworkException {
      rethrow;
    } catch (e) {
      // 非致命：周期规则同步失败不影响整体同步。
      // ignore: avoid_print
      print('周期规则同步失败（已跳过）：$e');
    }
  }

  /// 拉取银行卡：GET /api/cards 全量拉回，按 server_id 复用本地 id 覆盖；
  /// 对账删本地已同步但服务端已删除的行（保留未同步的本地新建）。
  ///
  /// CARD_SECRET 未配时 list() 抛 ApiException(503)，此处记警告、不更新本地、不中断。
  Future<void> _pullCards() async {
    List<Map<String, dynamic>> cards;
    try {
      cards = await _cards.list();
    } on ApiException catch (e) {
      if (e.statusCode == 503) {
        // [D3] 非致命：服务端未配置 CARD_SECRET，保留本地数据，跳过本次银行卡同步。
        // ignore: avoid_print
        print('银行卡同步跳过：服务端未配置 CARD_SECRET（503），保留本地数据');
        return;
      }
      rethrow; // 其它 ApiException（如 401）上抛，由 _pullAll 的 catch 记日志跳过。
    }

    // 离线删除防复活：读取 pending DELETE 中 bank_card 的 server_id 集合并入保留集。[D4]
    final pendingDel = await _pendingDeleteServerIds(['bank_card']);

    // server_id -> local_id 映射（来自本地库，保证复用同一 local id）。
    final localByServer = <String, String>{};
    final existingCreatedAt = <String, int?>{}; // server_id -> 原始 created_at[R2]
    final existingByServer = <String, BankCard>{}; // server_id -> 本地行（保留卡号用）
    final existing = await _bankDao.listAllIncludingDeleted();
    for (final c in existing) {
      if (c.serverId != null && c.serverId!.isNotEmpty) {
        localByServer[c.serverId!] = c.id;
        existingCreatedAt[c.serverId!] = c.createdAt;
        existingByServer[c.serverId!] = c;
      }
    }

    final pulled = <String>{};
    for (final j in cards) {
      final sid = (j['id'] as String?) ?? '';
      if (sid.isEmpty) continue;
      final localId = localByServer[sid] ?? _uuid.v4();
      // 已存在行复用原有 created_at，避免 pull 重置时间戳打乱创建顺序[R2]。
      final prevCreated = localByServer[sid] != null ? existingCreatedAt[sid] : null;
      // 保留本地已存卡号：未解锁拉取时服务端不返回 number，勿用 null 覆盖。[#5]
      final prev = existingByServer[sid];
      final number = (j['number'] as String?) ?? prev?.number;
      await _bankDao.upsert(
        BankCard.fromApi(j, localId: localId, createdAt: prevCreated)
            .copyWith(number: number),
      );
      localByServer[sid] = localId;
      pulled.add(sid);
    }

    // keep = 本次拉回 ∪ pendingDelete（pendingDelete 的本地已同步行暂时保留，防离线删复活）。
    final keep = <String>{...pulled, ...pendingDel};
    await _bankDao.deleteSyncedNotIn(keep);
  }

  /// 拉取周期规则：GET /api/recurring 全量拉回，按 server_id 复用本地 id 覆盖；
  /// 对账删本地已同步但服务端已删除的行（保留未同步的本地新建）。与 [_pullCards] 同构。
  Future<void> _pullRecurring() async {
    final rules = await _recurring.list();

    // 离线删除防复活：读取 pending DELETE 中 recurring_rule 的 server_id 集合并入保留集。[D4]
    final pendingDel = await _pendingDeleteServerIds(['recurring_rule']);

    final localByServer = <String, String>{};
    final existingCreatedAt = <String, int?>{}; // server_id -> 原始 created_at[R2]
    final existing = await _ruleDao.listAllIncludingDeleted();
    for (final r in existing) {
      if (r.serverId != null && r.serverId!.isNotEmpty) {
        localByServer[r.serverId!] = r.id;
        existingCreatedAt[r.serverId!] = r.createdAt;
      }
    }

    final pulled = <String>{};
    for (final j in rules) {
      final sid = (j['id'] as String?) ?? '';
      if (sid.isEmpty) continue;
      final localId = localByServer[sid] ?? _uuid.v4();
      // 已存在行复用原有 created_at，避免 pull 重置时间戳打乱创建顺序[R2]。
      final prevCreated = localByServer[sid] != null ? existingCreatedAt[sid] : null;
      await _ruleDao.upsert(RecurringRule.fromApi(j, localId: localId, createdAt: prevCreated));
      localByServer[sid] = localId;
      pulled.add(sid);
    }

    final keep = <String>{...pulled, ...pendingDel};
    await _ruleDao.deleteSyncedNotIn(keep);
  }

  /// 读取 pending DELETE 中指定实体的 server_id 集合（存入 client_id），
  /// 供 [_pullCards]/[_pullRecurring] 的「保留集」使用，防离线删除被服务端数据复活。[D4]
  Future<Set<String>> _pendingDeleteServerIds(List<String> entityTypes) async {
    return _opDao.pendingDeleteServerIds(entityTypes);
  }

  /// 由本地水线（epoch ms）生成发给服务端的 since（UTC ISO）。
  /// 回拨 10s 抵消设备/服务端时钟偏差，避免漏拉；增量 upsert 幂等，重叠无害。
  /// 返回 null 表示尚无水线（首拉，走全量对账）。
  String? _sinceParam(int? lastPullAt) {
    if (lastPullAt == null) return null;
    const skewMs = 10000;
    final safe = lastPullAt - skewMs;
    return DateTime.fromMillisecondsSinceEpoch(safe, isUtc: true)
        .toUtc()
        .toIso8601String();
  }

  /// 取一行服务端 updatedAt 的 epoch ms（UTC），用于推进本地水线。
  /// 水线取「本次拉到的最新服务端时间戳」而非设备时钟，可彻底规避设备/服务端
  /// 时钟偏差导致的漏拉。
  int? _updatedAtMs(Map<String, dynamic> j) {
    final v = j['updatedAt'];
    if (v is String) {
      final dt = DateTime.tryParse(v);
      if (dt != null) return dt.toUtc().millisecondsSinceEpoch;
    }
    return null;
  }

  Future<void> _pullGeneral(String ledgerId, String serverLedgerId) async {
    final lastPullAt = (await _ledgerDao.getById(ledgerId))?.lastPullAt;
    final since = _sinceParam(lastPullAt);
    final res = await _general.list(serverLedgerId, since: since);
    final entries = res.rows;
    final incremental = res.incremental;

    final existing = await _generalDao.listByLedger(ledgerId);
    final map = <String, String>{};
    for (final e in existing) {
      if (e.serverId != null) map[e.serverId!] = e.id;
    }
    int? maxUpdated;
    for (final j in entries) {
      final sid = j['id'] as String;
      final localId = map[sid] ?? _uuid.v4();
      await _generalDao.insert(GeneralEntry.fromApi(j, ledgerId, localId: localId));
      final u = _updatedAtMs(j);
      if (u != null && (maxUpdated == null || u > maxUpdated)) maxUpdated = u;
    }

    if (!incremental || since == null) {
      // 全量对账（首拉 / 旧服务端不支持增量）：删本地已同步但服务端已软删的行
      // （未同步的本地新建 server_id 为 null，不会被删，防离线记账丢失）。
      final serverIds = <String>{for (final j in entries) j['id'] as String};
      await _generalDao.deleteSyncedNotIn(ledgerId, serverIds);
    }
    // 增量模式只 upsert 变更行（含软删，fromApi 已写 deletedAt），禁止 deleteSyncedNotIn
    // 否则会把未返回的已同步本地行误删。水线推进到本次最新服务端时间戳。
    await _ledgerDao.updateLastPullAt(
        ledgerId, maxUpdated ?? DateTime.now().toUtc().millisecondsSinceEpoch);
  }

  Future<void> _pullWork(String ledgerId, String serverLedgerId) async {
    final lastPullAt = (await _ledgerDao.getById(ledgerId))?.lastPullAt;
    final since = _sinceParam(lastPullAt);
    final res = await _work.list(serverLedgerId, since: since);
    final entries = res.rows;
    final incremental = res.incremental;

    final existing = await _workDao.listByLedger(ledgerId);
    final map = <String, String>{};
    for (final e in existing) {
      if (e.serverId != null) map[e.serverId!] = e.id;
    }
    int? maxUpdated;
    for (final j in entries) {
      final sid = j['id'] as String;
      final localId = map[sid] ?? _uuid.v4();
      await _workDao.insert(WorkEntry.fromApi(j, ledgerId, localId: localId));
      final u = _updatedAtMs(j);
      if (u != null && (maxUpdated == null || u > maxUpdated)) maxUpdated = u;
    }

    if (!incremental || since == null) {
      final serverIds = <String>{for (final j in entries) j['id'] as String};
      await _workDao.deleteSyncedNotIn(ledgerId, serverIds);
    }
    await _ledgerDao.updateLastPullAt(
        ledgerId, maxUpdated ?? DateTime.now().toUtc().millisecondsSinceEpoch);
  }

  Future<void> _pullTaoyuan(String ledgerId, String serverLedgerId) async {
    final lastPullAt = (await _ledgerDao.getById(ledgerId))?.lastPullAt;
    final since = _sinceParam(lastPullAt);
    final res = await _events.list(serverLedgerId, since: since);
    final events = res.rows;
    final incremental = res.incremental;

    final existing = await _eventDao.listByLedger(ledgerId);
    final map = <String, String>{};
    for (final e in existing) {
      if (e.serverId != null) map[e.serverId!] = e.id;
    }
    int? maxUpdated;
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
      // 活动图片：列表接口未必返回 contentImages，详情接口一定包含；
      // 用详情补全，确保桃源活动图片能同步到本地。[#7]
      final imgs = detail['contentImages'] as String?;
      if (imgs != null && imgs.isNotEmpty) {
        final cur = await _eventDao.getById(localId);
        if (cur != null &&
            (cur.contentImages == null || cur.contentImages!.isEmpty)) {
          await _eventDao.update(cur.copyWith(contentImages: imgs));
        }
      }
      final u = _updatedAtMs(j);
      if (u != null && (maxUpdated == null || u > maxUpdated)) maxUpdated = u;
    }

    if (!incremental || since == null) {
      // 对账：删本地已同步但服务端已软删的活动（金额级联清理由 DAO 处理）。
      final serverIds = <String>{for (final j in events) j['id'] as String};
      await _eventDao.deleteSyncedNotIn(ledgerId, serverIds);
    }
    await _ledgerDao.updateLastPullAt(
        ledgerId, maxUpdated ?? DateTime.now().toUtc().millisecondsSinceEpoch);
  }

  Future<void> _pullTravel(String ledgerId, String serverLedgerId) async {
    // 成员先拉，建立 serverId -> localId（成员变更少且无增量端点，始终全量）。
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

    // 花费 + 分摊：增量或全量（视服务端能力与本地水线）。
    final lastPullAt = (await _ledgerDao.getById(ledgerId))?.lastPullAt;
    final since = _sinceParam(lastPullAt);
    List<Map<String, dynamic>> expenses;
    bool incremental;
    if (since != null) {
      final r = await _trip.listExpenses(serverLedgerId, since: since);
      expenses = r.rows;
      incremental = r.incremental;
      if (!incremental) {
        // 服务端忽略/不支持增量（旧服务端）：since 命中默认游标分页会返回截断页，
        // 直接当全量对账会误删数据。回退 all=1 全量拉取，保证集合完整。[向后兼容]
        final full = await _trip.listExpenses(serverLedgerId, all: true);
        expenses = full.rows;
        incremental = full.incremental;
      }
    } else {
      // 首拉（无水位）：直接全量。
      final full = await _trip.listExpenses(serverLedgerId, all: true);
      expenses = full.rows;
      incremental = full.incremental;
    }

    final existingExp = await _tripDao.listExpenses(ledgerId);
    final expMap = <String, String>{};
    for (final e in existingExp) {
      if (e.serverId != null) expMap[e.serverId!] = e.id;
    }
    int? maxUpdated;
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
      final u = _updatedAtMs(j);
      if (u != null && (maxUpdated == null || u > maxUpdated)) maxUpdated = u;
    }

    // 成员对账始终全量（成员无增量端点）；花费按增量/全量分支。
    final memberServerIds = <String>{for (final j in members) j['id'] as String};
    await _tripDao.deleteSyncedMembersNotIn(ledgerId, memberServerIds);
    if (!incremental || since == null) {
      final expServerIds = <String>{for (final j in expenses) j['id'] as String};
      await _tripDao.deleteSyncedExpensesNotIn(ledgerId, expServerIds);
    }
    await _ledgerDao.updateLastPullAt(
        ledgerId, maxUpdated ?? DateTime.now().toUtc().millisecondsSinceEpoch);
  }
}
