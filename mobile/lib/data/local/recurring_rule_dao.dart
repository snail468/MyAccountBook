import 'package:sqflite/sqflite.dart';
import '../db/database.dart';
import '../models/recurring_rule.dart';

/// 周期记账规则本地读写（对应 recurring_rules 表）。
///
/// 新增同步相关方法（[upsert]/[listAllIncludingDeleted]/[deleteSyncedNotIn]/
/// [markSynced]/[getById]），与 ledger_dao 同构；保留 [insert]/[listAll]/[delete] 兼容。
class RecurringRuleDao {
  final AppDatabase _db = AppDatabase.instance;

  Future<void> insert(RecurringRule r) async {
    final db = await _db.database;
    await db.insert('recurring_rules', r.toDb(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  /// upsert：按 id 覆盖；配合 server_id 唯一部分索引实现"同步复用本地 id"的更新语义。
  Future<void> upsert(RecurringRule r) async {
    final db = await _db.database;
    await db.insert('recurring_rules', r.toDb(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  /// 按 id 查本地规则（同步去重/标记用）。
  Future<RecurringRule?> getById(String id) async {
    final db = await _db.database;
    final rows =
        await db.query('recurring_rules', where: 'id = ?', whereArgs: [id]);
    if (rows.isEmpty) return null;
    return RecurringRule.fromDb(rows.first);
  }

  Future<List<RecurringRule>> listAll() async {
    final db = await _db.database;
    final rows = await db.query('recurring_rules', orderBy: 'next_date ASC');
    return rows.map(RecurringRule.fromDb).toList();
  }

  /// 全部本地规则（含所有行；规则无软删，此与 listAll 等价，
  /// 保留以对齐同步引擎对 server_id->local_id 映射的通用调用约定）。
  Future<List<RecurringRule>> listAllIncludingDeleted() async {
    final db = await _db.database;
    final rows = await db.query('recurring_rules', orderBy: 'next_date ASC');
    return rows.map(RecurringRule.fromDb).toList();
  }

  Future<void> delete(String id) async {
    final db = await _db.database;
    await db.delete('recurring_rules', where: 'id = ?', whereArgs: [id]);
  }

  /// 标记已同步：写入 server_id 并置 synced=1。
  Future<void> markSynced(String localId, String serverId) async {
    final db = await _db.database;
    await db.update(
      'recurring_rules',
      {'server_id': serverId, 'synced': 1},
      where: 'id = ?',
      whereArgs: [localId],
    );
  }

  /// 拉取对账：仅删「已同步(server_id 非 NULL)且不在 keep 集合」的本地行；
  /// 保留 server_id 为 NULL 的本地新建（待推送）。[D5]
  Future<void> deleteSyncedNotIn(Set<String> keepServerIds) async {
    final db = await _db.database;
    late final String where;
    late final List<Object?> args;
    if (keepServerIds.isEmpty) {
      where = 'server_id IS NOT NULL';
      args = const [];
    } else {
      where =
          'server_id IS NOT NULL AND server_id NOT IN (${List.filled(keepServerIds.length, '?').join(',')})';
      args = keepServerIds.toList();
    }
    await db.delete('recurring_rules', where: where, whereArgs: args);
  }
}
