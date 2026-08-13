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

  /// 两次全量同步的最小间隔：避免首页重建 / 多次进入触发频繁全量拉取（离线优先）。
  static const Duration _minSyncInterval = Duration(seconds: 30);
  DateTime? _lastSyncAt;

  /// 全量同步（先推后拉）。返回是否成功；登录失效会抛 [ApiException]。
  ///
  /// 30 秒内重复调用会被节流（视为成功直接返回），防止页面重建触发频繁同步。
  /// 需要强制刷新（手动下拉 / 点击刷新）时调用 [forceSync]。
  Future<bool> sync() async {
    final now = DateTime.now();
    if (_lastSyncAt != null && now.difference(_lastSyncAt!) < _minSyncInterval) {
      return true;
    }
    return _doSync();
  }

  /// 忽略节流，立即全量同步（手动刷新场景）。
  Future<bool> forceSync() async {
    _lastSyncAt = null;
    return _doSync();
  }

  /// 重置同步节流计时。退出登录后调用，确保重新登录能立即全量同步。
  void resetSync() {
    _lastSyncAt = null;
  }

  /// 清空内存缓存并重置节流（切换用户时调用）：避免上一用户的账本列表残留在
  /// 首页/汇总，下一用户进首页先看到空白再被同步填充 [#2]。
  void resetCache() {
    _all = [];
    _allIncludingDeleted = [];
    _lastSyncAt = null;
    _error = null;
    notifyListeners();
  }

  Future<bool> _doSync() async {
    _syncing = true;
    _error = null;
    notifyListeners();
    try {
      final ok = await _sync.syncAll();
      if (ok) {
        await load();
        _lastSyncAt = DateTime.now();
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
