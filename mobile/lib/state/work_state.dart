import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../core/money.dart';
import '../data/local/work_entry_dao.dart';
import '../data/models/work_entry.dart';
import '../data/models/ledger.dart';
import '../sync/sync_service.dart';

const String _kEntity = 'work_entry';

/// 工作账本：按月归账（垫款/回款）。先落本地，再入队。
class WorkState extends ChangeNotifier {
  final WorkEntryDao _dao = WorkEntryDao();
  final SyncService _sync = SyncService.instance;
  final Ledger ledger;
  WorkState(this.ledger);

  List<WorkEntry> _entries = [];
  List<WorkEntry> get entries => _entries;

  Future<void> load() async {
    _entries = await _dao.listByLedger(ledger.id);
    notifyListeners();
  }

  static String _yearMonth(int occurredAt) {
    final d = DateTime.fromMillisecondsSinceEpoch(occurredAt);
    return '${d.year}-${d.month.toString().padLeft(2, '0')}';
  }

  Future<void> addEntry({
    required String direction,
    required String category,
    required int amountCents,
    String? note,
    required int occurredAt,
  }) async {
    final e = WorkEntry(
      id: const Uuid().v4(),
      ledgerId: ledger.id,
      yearMonth: _yearMonth(occurredAt),
      category: category,
      direction: direction,
      amountCents: amountCents,
      note: note,
      occurredAt: occurredAt,
      synced: 0,
      clientId: const Uuid().v4(),
    );
    await _dao.insert(e);
    final body = e.toApiBody();
    body['ledgerId'] = ledger.serverId ?? ledger.id; // 用服务端账本 id
    await _sync.enqueue(
      method: 'POST',
      path: '/entries',
      body: body,
      clientId: e.clientId,
      entity: _kEntity,
      entityLocalId: e.id,
    );
    await load();
  }

  Future<void> deleteEntry(WorkEntry e) async {
    await _dao.softDelete(e.id);
    if (e.serverId != null) {
      await _sync.enqueue(
        method: 'DELETE',
        path: '/entries/${e.serverId}',
        entity: _kEntity,
        entityLocalId: e.id,
      );
    } else {
      await _sync.removePendingFor(e.id);
    }
    await load();
  }

  /// 编辑已存在的条目（对齐网页 [EditEntryModal] 的 PATCH action=meta）。
  ///
  /// 复用 [WorkEntryDao.insert] 的 [ConflictAlgorithm.replace]（同 id 覆盖=更新），
  /// 不新增 DAO 方法。已同步条目入队 PATCH /entries/:serverId；本地未同步条目
  /// 用 [SyncService.enqueueCoalesced] 改写待发 POST（按 clientId 去重）。
  Future<void> updateEntry(WorkEntry updated) async {
    await _dao.insert(updated);
    final body = updated.toApiBody();
    body['ledgerId'] = ledger.serverId ?? ledger.id;
    if (updated.serverId != null) {
      body['action'] = 'meta';
      await _sync.enqueue(
        method: 'PATCH',
        path: '/entries/${updated.serverId}',
        body: body,
        entity: _kEntity,
        entityLocalId: updated.id,
      );
    } else {
      await _sync.enqueueCoalesced(
        method: 'POST',
        path: '/entries',
        body: body,
        clientId: updated.clientId,
        entity: _kEntity,
        entityLocalId: updated.id,
      );
    }
    await load();
  }

  /// 标记某出项已回款（对齐网页 PATCH action=refund）。
  ///
  /// 复用 [WorkEntryDao.insert] 的 replace 同 id 覆盖；已同步条目入队
  /// PATCH /entries/:serverId（带 refundedAt），未同步本地条目改写待发 POST
  /// （按 clientId coalesced）。更新后重新加载并通知监听者。
  Future<void> refundEntry(WorkEntry e, int refundedAt) async {
    final updated = WorkEntry(
      id: e.id,
      ledgerId: e.ledgerId,
      serverId: e.serverId,
      yearMonth: e.yearMonth,
      category: e.category,
      direction: e.direction,
      amountCents: e.amountCents,
      note: e.note,
      occurredAt: e.occurredAt,
      refundedAt: refundedAt,
      deletedAt: e.deletedAt,
      synced: 0,
      clientId: e.clientId ?? e.id,
    );
    await _dao.insert(updated);
    final body = updated.toApiBody();
    body['ledgerId'] = ledger.serverId ?? ledger.id; // 用服务端账本 id
    if (updated.serverId != null) {
      body['action'] = 'refund';
      body['refundedAt'] =
          DateTime.fromMillisecondsSinceEpoch(refundedAt).toUtc().toIso8601String();
      await _sync.enqueue(
        method: 'PATCH',
        path: '/entries/${updated.serverId}',
        body: body,
        entity: _kEntity,
        entityLocalId: updated.id,
      );
    } else {
      await _sync.enqueueCoalesced(
        method: 'POST',
        path: '/entries',
        body: body,
        clientId: updated.clientId,
        entity: _kEntity,
        entityLocalId: updated.id,
      );
    }
    await load();
  }

  /// 撤销回款（对齐网页 PATCH action=unrefund）。
  ///
  /// 同样用 replace 覆盖，把 refundedAt 置空；已同步条目入队 PATCH action=unrefund，
  /// 未同步本地条目改写待发 POST（coalesced）。
  Future<void> unrefundEntry(WorkEntry e) async {
    final updated = WorkEntry(
      id: e.id,
      ledgerId: e.ledgerId,
      serverId: e.serverId,
      yearMonth: e.yearMonth,
      category: e.category,
      direction: e.direction,
      amountCents: e.amountCents,
      note: e.note,
      occurredAt: e.occurredAt,
      refundedAt: null,
      deletedAt: e.deletedAt,
      synced: 0,
      clientId: e.clientId ?? e.id,
    );
    await _dao.insert(updated);
    final body = updated.toApiBody();
    body['ledgerId'] = ledger.serverId ?? ledger.id;
    if (updated.serverId != null) {
      body['action'] = 'unrefund';
      await _sync.enqueue(
        method: 'PATCH',
        path: '/entries/${updated.serverId}',
        body: body,
        entity: _kEntity,
        entityLocalId: updated.id,
      );
    } else {
      await _sync.enqueueCoalesced(
        method: 'POST',
        path: '/entries',
        body: body,
        clientId: updated.clientId,
        entity: _kEntity,
        entityLocalId: updated.id,
      );
    }
    await load();
  }
}
