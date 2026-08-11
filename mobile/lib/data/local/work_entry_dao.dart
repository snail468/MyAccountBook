import 'package:sqflite/sqflite.dart';
import '../db/database.dart';
import '../models/work_entry.dart';
import '../models/stats_row.dart';

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

  /// 拉取对账：删本地已同步但服务端已不存在的行；不动未同步的本地新建。
  Future<void> deleteSyncedNotIn(String ledgerId, Set<String> serverIds) async {
    final db = await _db.database;
    if (serverIds.isEmpty) {
      await db.delete('work_entries',
          where: 'ledger_id = ? AND server_id IS NOT NULL', whereArgs: [ledgerId]);
      return;
    }
    final ph = List.filled(serverIds.length, '?').join(',');
    await db.delete(
      'work_entries',
      where:
          'ledger_id = ? AND server_id IS NOT NULL AND server_id NOT IN ($ph)',
      whereArgs: [ledgerId, ...serverIds],
    );
  }

  /// 累计收入/支出合计（分），不限月份 —— 首页"总收入 A"里的 B 分量用。
  Future<({int income, int expense})> cumulativeTotals(
      String ledgerId) async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      '''SELECT direction, SUM(amount_cents) AS s
         FROM work_entries
         WHERE ledger_id = ? AND deleted_at IS NULL
         GROUP BY direction''',
      [ledgerId],
    );
    int income = 0;
    int expense = 0;
    for (final r in rows) {
      final dir = r['direction'] as String;
      final sum = (r['s'] as num?)?.toInt() ?? 0;
      if (dir == 'income') {
        income = sum;
      } else {
        expense = sum;
      }
    }
    return (income: income, expense: expense);
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

  /// 统计聚合用：工作账本只把 income 方向计入现金流（垫款本质是回款，不计支出），
  /// 取窗口内记录。对齐网页端 loadRows 的 entries 分支（direction: 'income'）。
  Future<List<StatRow>> statsRows(int since) async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      '''SELECT occurred_at, amount_cents, category
         FROM work_entries
         WHERE deleted_at IS NULL AND direction = 'income' AND occurred_at >= ?''',
      [since],
    );
    return rows.map((r) => StatRow(
      occurredAt: DateTime.fromMillisecondsSinceEpoch(r['occurred_at'] as int),
      amountCents: (r['amount_cents'] as num?)?.toInt() ?? 0,
      direction: 'income',
      category: (r['category'] as String?) ?? '工作',
    )).toList();
  }
}
