import '../db/database.dart';
import '../models/work_entry.dart';

/// 工作账本条目本地读写。
class WorkEntryDao {
  final AppDatabase _db = AppDatabase.instance;

  /// 插入；拉取同步时用 [ConflictAlgorithm.replace] 按 id 覆盖已存在行。
  Future<void> insert(WorkEntry e) async {
    final db = await _db.database;
    await db.insert('work_entries', e.toDb(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<WorkEntry>> listByLedger(String ledgerId,
      {bool descending = true}) async {
    final db = await _db.database;
    final rows = await db.query(
      'work_entries',
      where: 'ledger_id = ? AND deleted_at IS NULL',
      whereArgs: [ledgerId],
      orderBy: descending ? 'occurred_at DESC' : 'occurred_at ASC',
    );
    return rows.map(WorkEntry.fromDb).toList();
  }

  Future<WorkEntry?> getById(String id) async {
    final db = await _db.database;
    final rows = await db.query('work_entries', where: 'id = ?', whereArgs: [id]);
    if (rows.isEmpty) return null;
    return WorkEntry.fromDb(rows.first);
  }

  Future<void> softDelete(String id) async {
    final db = await _db.database;
    await db.update(
      'work_entries',
      {'deleted_at': DateTime.now().millisecondsSinceEpoch, 'synced': 0},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> markSynced(String localId, String serverId) async {
    final db = await _db.database;
    await db.update(
      'work_entries',
      {'synced': 1, 'server_id': serverId},
      where: 'id = ?',
      whereArgs: [localId],
    );
  }

  /// 各月合计（支出/收入），用于工作账本"按月卡片"。
  Future<Map<String, ({int income, int expense})>> totalsByMonth(
      String ledgerId) async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      '''SELECT year_month, direction, SUM(amount_cents) AS s
         FROM work_entries
         WHERE ledger_id = ? AND deleted_at IS NULL
         GROUP BY year_month, direction''',
      [ledgerId],
    );
    final map = <String, ({int income, int expense})>{};
    for (final r in rows) {
      final ym = r['year_month'] as String;
      final dir = r['direction'] as String;
      final sum = (r['s'] as num?)?.toInt() ?? 0;
      final cur = map[ym] ?? (income: 0, expense: 0);
      map[ym] = dir == 'income'
          ? (income: cur.income + sum, expense: cur.expense)
          : (income: cur.income, expense: cur.expense + sum);
    }
    return map;
  }
}
