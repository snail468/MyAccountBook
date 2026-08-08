import 'package:flutter/foundation.dart';
import '../data/local/ledger_dao.dart';
import '../data/models/ledger.dart';
import '../sync/sync_service.dart';

/// 首页账本列表 + 全量同步触发。
class LedgerListState extends ChangeNotifier {
  final LedgerDao _dao = LedgerDao();
  final SyncService _sync = SyncService.instance;

  List<Ledger> _all = [];
  bool _syncing = false;
  String? _error;

  List<Ledger> get all => _all;
  bool get syncing => _syncing;
  String? get error => _error;

  List<Ledger> byKind(String kind) => _all.where((l) => l.kind == kind).toList();

  Future<void> load() async {
    _all = await _dao.listAll();
    notifyListeners();
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
