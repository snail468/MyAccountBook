import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../data/local/general_entry_dao.dart';
import '../data/models/general_entry.dart';
import '../data/models/ledger.dart';
import '../sync/sync_service.dart';

const String _kEntity = 'general_entry';

/// 普通账本：条目列表 + 记一笔 + 删除。全部先落本地，再入队同步。
class GeneralState extends ChangeNotifier {
  final GeneralEntryDao _dao = GeneralEntryDao();
  final SyncService _sync = SyncService.instance;
  final Ledger ledger;
  GeneralState(this.ledger);

  List<GeneralEntry> _entries = [];
  List<GeneralEntry> get entries => _entries;

  Future<void> load() async {
    _entries = await _dao.listByLedger(ledger.id);
    notifyListeners();
  }

  Future<void> addEntry({
    required String direction,
    required String category,
    required int amountCents,
    String? tags,
    String? note,
    required int occurredAt,
  }) async {
    final e = GeneralEntry(
      id: const Uuid().v4(),
      ledgerId: ledger.id,
      direction: direction,
      category: category,
      amountCents: amountCents,
      tags: tags,
      note: note,
      occurredAt: occurredAt,
      synced: 0,
      clientId: const Uuid().v4(),
    );
    await _dao.insert(e);
    await _sync.enqueue(
      method: 'POST',
      path: '/ledgers/${ledger.serverId ?? ledger.id}/entries',
      body: e.toApiBody(),
      clientId: e.clientId,
      entity: _kEntity,
      entityLocalId: e.id,
    );
    await load();
  }

  Future<void> deleteEntry(GeneralEntry e) async {
    await _dao.softDelete(e.id);
    if (e.serverId != null) {
      await _sync.enqueue(
        method: 'DELETE',
        path: '/ledgers/${ledger.serverId ?? ledger.id}/entries/${e.serverId}',
        entity: _kEntity,
        entityLocalId: e.id,
      );
    } else {
      // 服务端还不存在这条记录：清掉入队的创建操作即可
      await _sync.removePendingFor(e.id);
    }
    await load();
  }
}
