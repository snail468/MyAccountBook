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
}
