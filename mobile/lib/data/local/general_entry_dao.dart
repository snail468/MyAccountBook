import 'package:sqflite/sqflite.dart';
import '../db/database.dart';
import '../models/general_entry.dart';

/// 普通账本条目本地读写。
class GeneralEntryDao {
  final AppDatabase _db = AppDatabase.instance;

  /// 插入；拉取同步时用 [ConflictAlgorithm.replace] 按 id 覆盖已存在行。
  Future<void> insert(GeneralEntry e) async {
    final db = await _db.database;
    await db.insert('general_entries', e.toDb(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<GeneralEntry>> listByLedger(String ledgerId,
      {bool descending = true}) async {
    final db = await _db.database;
    final rows = await db.query(
      'general_entries',
      where: 'ledger_id = ? AND deleted_at IS NULL',
      whereArgs: [ledgerId],
      orderBy: descending ? 'occurred_at DESC' : 'occurred_at ASC',
    );
    return rows.map(GeneralEntry.fromDb).toList();
  }

  Future<GeneralEntry?> getById(String id) async {
    final db = await _db.database;
    final rows =
        await db.query('general_entries', where: 'id = ?', whereArgs: [id]);
    if (rows.isEmpty) return null;
    return GeneralEntry.fromDb(rows.first);
  }

  Future<void> softDelete(String id) async {
    final db = await _db.database;
    await db.update(
      'general_entries',
      {'deleted_at': DateTime.now().millisecondsSinceEpoch, 'synced': 0},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> markSynced(String localId, String serverId) async {
    final db = await _db.database;
    await db.update(
      'general_entries',
      {'synced': 1, 'server_id': serverId},
      where: 'id = ?',
      whereArgs: [localId],
    );
  }

  /// 拉取对账：删本地「已同步(server_id 非空)」但服务端已不存在(serverId 不在
  /// [serverIds])的行。绝不删未同步(server_id 为 null)的本地行（待推送的新建）。
  Future<void> deleteSyncedNotIn(String ledgerId, Set<String> serverIds) async {
    final db = await _db.database;
    if (serverIds.isEmpty) {
      await db.delete('general_entries',
          where: 'ledger_id = ? AND server_id IS NOT NULL', whereArgs: [ledgerId]);
      return;
    }
    final ph = List.filled(serverIds.length, '?').join(',');
    await db.delete(
      'general_entries',
      where:
          'ledger_id = ? AND server_id IS NOT NULL AND server_id NOT IN ($ph)',
      whereArgs: [ledgerId, ...serverIds],
    );
  }

  /// 某月收入/支出合计（分）。预算进度用。
  Future<({int income, int expense})> monthlyTotals(
      String ledgerId, String yearMonth) async {
    final db = await _db.database;
    // 用本地 occurredAt 落在当月来聚合（与网页端"按月"语义一致）。
    final start = _monthStart(yearMonth);
    final end = _monthEnd(yearMonth);
    final rows = await db.rawQuery(
      '''SELECT direction, SUM(amount_cents) AS s
         FROM general_entries
         WHERE ledger_id = ? AND deleted_at IS NULL
           AND occurred_at >= ? AND occurred_at < ?
         GROUP BY direction''',
      [ledgerId, start, end],
    );
    int income = 0;
    int expense = 0;
    for (final r in rows) {
      final dir = r['direction'] as String;
      final sum = (r['s'] as num?)?.toInt() ?? 0;
      if (dir == 'income') income = sum;
      if (dir == 'expense') expense = sum;
    }
    return (income: income, expense: expense);
  }

  /// 全部普通账本的收入 / 支出合计（分）。统计页总额用。
  Future<({int income, int expense})> totalsAll() async {
    final db = await _db.database;
    final rows = await db.rawQuery('''
      SELECT direction, SUM(amount_cents) AS s
      FROM general_entries
      WHERE deleted_at IS NULL
      GROUP BY direction
    ''');
    int income = 0;
    int expense = 0;
    for (final r in rows) {
      final dir = r['direction'] as String;
      final sum = (r['s'] as num?)?.toInt() ?? 0;
      if (dir == 'income') income = sum;
      if (dir == 'expense') expense = sum;
    }
    return (income: income, expense: expense);
  }

  /// 最近 [months] 个月的收入 / 支出趋势（分），升序返回连续 [months] 个 YYYY-MM。
  Future<List<({String month, int income, int expense})>> monthlyTrend(
      {int months = 12}) async {
    final db = await _db.database;
    final now = DateTime.now();
    final startD = DateTime(now.year, now.month - (months - 1), 1);
    final start = startD.millisecondsSinceEpoch;
    final end = DateTime(now.year, now.month + 1, 1).millisecondsSinceEpoch;
    final rows = await db.rawQuery('''
      SELECT occurred_at, direction, amount_cents
      FROM general_entries
      WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ?
    ''', [start, end]);

    final byMonth =
        <String, ({int income, int expense})>{};
    for (final r in rows) {
      final millis = r['occurred_at'] as int;
      final d = DateTime.fromMillisecondsSinceEpoch(millis);
      final ym = '${d.year}-${d.month.toString().padLeft(2, '0')}';
      final dir = r['direction'] as String;
      final sum = (r['amount_cents'] as num?)?.toInt() ?? 0;
      final cur = byMonth[ym] ?? (income: 0, expense: 0);
      byMonth[ym] = dir == 'income'
          ? (income: cur.income + sum, expense: cur.expense)
          : (income: cur.income, expense: cur.expense + sum);
    }

    final result = <({String month, int income, int expense})>[];
    for (var i = 0; i < months; i++) {
      final d = DateTime(startD.year, startD.month + i, 1);
      final ym = '${d.year}-${d.month.toString().padLeft(2, '0')}';
      final v = byMonth[ym] ?? (income: 0, expense: 0);
      result.add((month: ym, income: v.income, expense: v.expense));
    }
    return result;
  }

  /// 支出按类别占比（分），降序。
  Future<List<({String label, int cents})>> categoryBreakdown() async {
    final db = await _db.database;
    final rows = await db.rawQuery('''
      SELECT category, SUM(amount_cents) AS s
      FROM general_entries
      WHERE deleted_at IS NULL AND direction = 'expense'
      GROUP BY category
      ORDER BY s DESC
    ''');
    return rows.map((r) => (
          label: r['category'] as String,
          cents: (r['s'] as num?)?.toInt() ?? 0,
        )).toList();
  }

  static int _monthStart(String ym) {
    final parts = ym.split('-');
    final y = int.parse(parts[0]);
    final m = int.parse(parts[1]);
    return DateTime(y, m, 1).millisecondsSinceEpoch;
  }

  static int _monthEnd(String ym) {
    final parts = ym.split('-');
    final y = int.parse(parts[0]);
    final m = int.parse(parts[1]);
    return DateTime(y, m + 1, 1).millisecondsSinceEpoch;
  }
}
