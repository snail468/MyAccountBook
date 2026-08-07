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
