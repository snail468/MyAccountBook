import 'package:flutter/foundation.dart';
import '../core/exceptions.dart';
import '../data/local/ledger_dao.dart';
import '../data/models/ledger.dart';
import '../sync/sync_service.dart';

/// 首页账本列表 + 全量同步触发。
class LedgerListState extends ChangeNotifier {
  final LedgerDao _dao = LedgerDao();
  final SyncService _sync = SyncService.instance;

  List<Ledger> _all = [];
  List<Ledger> _allIncludingDeleted = [];
  bool _syncing = false;
  String? _error;

  List<Ledger> get all => _all;
  List<Ledger> get allIncludingDeleted => _allIncludingDeleted;
  bool get syncing => _syncing;
  String? get error => _error;

  List<Ledger> byKind(String kind) => _all.where((l) => l.kind == kind).toList();

  Future<void> load() async {
    _all = await _dao.listAll();
    _allIncludingDeleted = await _dao.listAllIncludingDeleted();
    notifyListeners();
  }

  /// 软删除：标记 deletedAt，写回本地并重新加载。
  Future<void> softDelete(Ledger l) async {
    final updated = l.copyWith(
      deletedAt: DateTime.now().millisecondsSinceEpoch,
      synced: 0,
    );
    await _dao.upsert(updated);
    await load();
  }

  /// 恢复：清除 deletedAt，写回本地并重新加载。
  Future<void> restore(Ledger l) async {
    final updated = l.copyWith(deletedAt: null, synced: 0);
    await _dao.upsert(updated);
    await load();
  }

  /// 新建账本：直接落本地并重新加载。
  Future<void> createLedger(Ledger l) async {
    await _dao.upsert(l);
    await load();
  }

  /// 彻底删除：物理删除并重新加载。
  Future<void> hardDelete(Ledger l) async {
    await _dao.delete(l.id);
    await load();
  }

  /// 全量同步（先推后拉）。返回是否成功；登录失效会抛 [ApiException]。
  Future<bool> sync() async {
    _syncing = true;
    _error = null;
    notifyListeners();
    try {
      final ok = await _sync.syncAll();
      if (ok) {
        await load();
      } else {
        _error = '同步失败：可能离线或登录失效';
      }
      _syncing = false;
      notifyListeners();
      return ok;
    } catch (e) {
      _syncing = false;
      if (e is ApiException) {
        _error = '同步失败：${e.message}';
      } else {
        _error = '同步异常：${e.toString()}';
      }
      notifyListeners();
      rethrow;
    }
  }
}
