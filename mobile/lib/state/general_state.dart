import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../core/general_categories.dart';
import '../data/local/general_entry_dao.dart';
import '../data/local/ledger_dao.dart';
import '../data/local/pending_op_dao.dart';
import '../data/models/general_entry.dart';
import '../data/models/ledger.dart';
import '../sync/sync_service.dart';

const String _kEntity = 'general_entry';

/// 普通账本：条目列表 + 记一笔 + 编辑 + 删除 + 账本设置/分类管理。
///
/// 全部先落本地（乐观更新），再入队同步。除条目外，还聚合「本月 / 本周」汇总
/// （收入、支出、分类支出、分类预算），供 [GeneralLedgerPage] 的卡片使用。
class GeneralState extends ChangeNotifier {
  final GeneralEntryDao _dao = GeneralEntryDao();
  final LedgerDao _ledgerDao = LedgerDao();
  final SyncService _sync = SyncService.instance;

  /// 非 final：设置页改名 / 预算 / 分类后可整体替换为新对象。
  Ledger ledger;
  GeneralState(this.ledger);

  List<GeneralEntry> _entries = [];
  List<GeneralEntry> get entries => _entries;

  // ---- 汇总数据 ----
  String currentYearMonth = _ym(DateTime.now());
  int monthIncome = 0;
  int monthExpense = 0;
  Map<String, int> monthCategorySpend = const {};

  late int weekStart = _weekStart(DateTime.now());
  late int weekEnd = _weekEnd(DateTime.now());
  Map<String, int> weekCategorySpend = const {};

  CustomCategories customCategories = const CustomCategories();

  /// 离线待同步操作数（[PendingOpDao.pendingCount]）。
  int pendingCount = 0;

  /// 是否正在加载本地数据（首次 load 为 true）。
  bool loading = true;

  int get net => monthIncome - monthExpense;

  Future<void> load() async {
    loading = true;
    notifyListeners();
    _entries = await _dao.listByLedger(ledger.id);
    await _reloadSummary();
    pendingCount = await PendingOpDao().pendingCount();
    loading = false;
    notifyListeners();
  }

  Future<void> _reloadSummary() async {
    final now = DateTime.now();
    currentYearMonth = _ym(now);
    weekStart = _weekStart(now);
    weekEnd = _weekEnd(now);
    customCategories = CustomCategories.parse(ledger.customCategories);

    final mt = await _dao.monthlyTotals(ledger.id, currentYearMonth);
    monthIncome = mt.income;
    monthExpense = mt.expense;
    monthCategorySpend = await _dao.categorySpend(
        ledger.id, _monthStartMillis(currentYearMonth), _monthEndMillis(currentYearMonth));
    weekCategorySpend =
        await _dao.categorySpend(ledger.id, weekStart, weekEnd);
  }

  // ---------------- 写操作 ----------------

  Future<void> addEntry({
    required String direction,
    required String category,
    required int amountCents,
    String? tags,
    String? note,
    required int occurredAt,
    List<String> imageUrls = const [],
  }) async {
    final e = GeneralEntry(
      id: const Uuid().v4(),
      ledgerId: ledger.id,
      direction: direction,
      category: category,
      amountCents: amountCents,
      tags: tags,
      note: note,
      imageUrls: imageUrls,
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

  /// 保存编辑后的条目：按 id 覆盖（[GeneralEntryDao.insert] 用 replace），
  /// 已同步的入队 PUT，未同步的清旧待操作后再入队 POST（幂等）。
  Future<void> saveEntry(GeneralEntry e) async {
    await _dao.insert(e);
    if (e.serverId != null) {
      await _sync.enqueue(
        method: 'PUT',
        path: '/ledgers/${ledger.serverId ?? ledger.id}/entries/${e.serverId}',
        body: e.toApiBody(),
        entity: _kEntity,
        entityLocalId: e.id,
      );
    } else {
      await _sync.removePendingFor(e.id);
      await _sync.enqueue(
        method: 'POST',
        path: '/ledgers/${ledger.serverId ?? ledger.id}/entries',
        body: e.toApiBody(),
        clientId: e.clientId,
        entity: _kEntity,
        entityLocalId: e.id,
      );
    }
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

  /// 保存账本设置（名称 / 月度预算 / 自定义分类等），落本地后刷新汇总。
  Future<void> updateLedger(Ledger updated) async {
    final next = updated.copyWith(synced: 0);
    await _ledgerDao.upsert(next);
    ledger = next;
    await _reloadSummary();
    pendingCount = await PendingOpDao().pendingCount();
    notifyListeners();
  }

  /// 触发一次离线同步（失败向上抛，由调用方提示）。完成后刷新待同步计数。
  Future<void> syncNow() async {
    try {
      await _sync.syncAll();
    } finally {
      pendingCount = await PendingOpDao().pendingCount();
      notifyListeners();
    }
  }

  // ---------------- 时间工具 ----------------

  static String _ym(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}';

  static int _monthStartMillis(String ym) {
    final p = ym.split('-');
    return DateTime(int.parse(p[0]), int.parse(p[1]), 1).millisecondsSinceEpoch;
  }

  static int _monthEndMillis(String ym) {
    final p = ym.split('-');
    return DateTime(int.parse(p[0]), int.parse(p[1]) + 1, 1).millisecondsSinceEpoch;
  }

  /// 本周一 00:00（周一为一周起点）。
  static int _weekStart(DateTime now) {
    final today = DateTime(now.year, now.month, now.day);
    return today
        .subtract(Duration(days: today.weekday - 1))
        .millisecondsSinceEpoch;
  }

  /// 下周一 00:00。
  static int _weekEnd(DateTime now) {
    final s = DateTime.fromMillisecondsSinceEpoch(_weekStart(now));
    return DateTime(s.year, s.month, s.day + 7).millisecondsSinceEpoch;
  }
}
