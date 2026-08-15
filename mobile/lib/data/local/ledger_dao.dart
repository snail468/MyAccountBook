import 'package:sqflite/sqflite.dart';
import '../db/database.dart';
import '../models/ledger.dart';

/// 账本本地读写。
class LedgerDao {
  final AppDatabase _db = AppDatabase.instance;

  Future<void> upsert(Ledger l) async {
    final db = await _db.database;
    // 保留本地增量同步水线：ConflictAlgorithm.replace 会整行覆盖，若不读回旧值，
    // 每次 _pullAll 的 upsert 都会把 last_pull_at 重置为 null，导致永远走全量拉取、
    // 真·增量失效。Ledger.fromApi 不填充 lastPullAt（服务端无此字段），故需在此兜底。
    final prev = await db.query('ledgers',
        columns: ['last_pull_at'], where: 'id = ?', whereArgs: [l.id], limit: 1);
    final prevLastPull = prev.isNotEmpty ? (prev.first['last_pull_at'] as int?) : null;
    await db.insert(
      'ledgers',
      {...l.toDb(), 'last_pull_at': prevLastPull ?? l.lastPullAt},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<Ledger?> getById(String id) async {
    final db = await _db.database;
    final rows = await db.query('ledgers', where: 'id = ?', whereArgs: [id]);
    if (rows.isEmpty) return null;
    return Ledger.fromDb(rows.first);
  }

  /// 按 server_id 查本地账本（同步去重用）。唯一索引保证最多一行。
  Future<Ledger?> getByServerId(String serverId) async {
    final db = await _db.database;
    final rows = await db.query(
      'ledgers',
      where: 'server_id = ?',
      whereArgs: [serverId],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return Ledger.fromDb(rows.first);
  }

  /// 列出某类型、未删除的账本（首页用）。
  Future<List<Ledger>> listByKind(String kind) async {
    final db = await _db.database;
    final rows = await db.query(
      'ledgers',
      where: 'kind = ? AND deleted_at IS NULL',
      whereArgs: [kind],
      orderBy: 'sort_order ASC',
    );
    return rows.map(Ledger.fromDb).toList();
  }

  /// 全部未删除账本（首页总览）。
  Future<List<Ledger>> listAll() async {
    final db = await _db.database;
    final rows = await db.query(
      'ledgers',
      where: 'deleted_at IS NULL',
      orderBy: 'sort_order ASC',
    );
    return rows.map(Ledger.fromDb).toList();
  }

  /// 全部账本（含已软删除），用于账本管理页的回收站分区。
  Future<List<Ledger>> listAllIncludingDeleted() async {
    final db = await _db.database;
    final rows = await db.query(
      'ledgers',
      orderBy: 'sort_order ASC',
    );
    return rows.map(Ledger.fromDb).toList();
  }

  /// 按 id 物理删除（回收站「彻底删除」用）。
  Future<void> delete(String id) async {
    final db = await _db.database;
    await db.delete('ledgers', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> softDelete(String id) async {
    final db = await _db.database;
    await db.update(
      'ledgers',
      {'deleted_at': DateTime.now().millisecondsSinceEpoch, 'synced': 0},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> markSynced(String id, String serverId) async {
    final db = await _db.database;
    await db.update(
      'ledgers',
      {'synced': 1, 'server_id': serverId},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// 记录某账本上次成功拉取条目变更的时间戳（增量同步水线）。
  Future<void> updateLastPullAt(String id, int ts) async {
    final db = await _db.database;
    await db.update(
      'ledgers',
      {'last_pull_at': ts},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// 清空所有账本的增量水线，强制下次同步走全量拉取。
  ///
  /// 增量同步只回拉「水线之后的变更」，无法补回本地因历史同步抖动而丢失、
  /// 但其服务端 updatedAt 又早于水线的历史行。只有全量对账（since=null）才能
  /// 把这类行补回来。供手动「重新同步 / 修复数据」使用。[Bug2]
  Future<void> resetAllLastPullAt() async {
    final db = await _db.database;
    await db.update('ledgers', {'last_pull_at': null});
  }

  /// 拉取对账 + 级联：删本地「已同步但服务端已删除」的账本，并清掉其下全部本地
  /// 子数据（金额/分摊引用父表，先清子再清父）。绝不删未同步(server_id 为 null)
  /// 的本地账本（待推送的新建）。
  Future<void> deleteSyncedNotIn(Set<String> serverIds) async {
    final db = await _db.database;
    late final String ph;
    late final List<Object?> args;
    if (serverIds.isEmpty) {
      ph = 'server_id IS NOT NULL';
      args = const [];
    } else {
      ph =
          'server_id IS NOT NULL AND server_id NOT IN (${List.filled(serverIds.length, '?').join(',')})';
      args = serverIds.toList();
    }
    final rows =
        await db.query('ledgers', columns: ['id'], where: ph, whereArgs: args);
    for (final r in rows) {
      await _cascadeDeleteLedger(db, r['id'] as String);
    }
  }

  /// 删除某 kind 的本地幽灵账本（server_id 为 null，从未成功推送）。
  ///
  /// 用于内置账本（work/taoyuan）：服务端已返回该 kind 的正式账本时，本地
  /// 幽灵（历史遗留、创建后从未推送成功）无法再推送（内置账本 one-per-owner），
  /// 只会让首页重复显示两张同类型卡片。级联删除其子数据。[#重复同步]
  Future<void> deleteLocalGhostsOfKind(String kind) async {
    final db = await _db.database;
    final rows = await db.query('ledgers',
        columns: ['id'],
        where: 'kind = ? AND server_id IS NULL',
        whereArgs: [kind]);
    for (final r in rows) {
      await _cascadeDeleteLedger(db, r['id'] as String);
    }
  }

  /// 级联删除某账本及其全部子数据（金额/分摊/条目等，先子后父）。
  Future<void> _cascadeDeleteLedger(Database db, String lid) async {
    await db.delete('event_amounts',
        where: 'event_id IN (SELECT id FROM taoyuan_events WHERE ledger_id = ?)',
        whereArgs: [lid]);
    await db.delete('taoyuan_events', where: 'ledger_id = ?', whereArgs: [lid]);
    await db.delete('trip_splits',
        where: 'expense_id IN (SELECT id FROM trip_expenses WHERE ledger_id = ?)',
        whereArgs: [lid]);
    await db.delete('trip_expenses', where: 'ledger_id = ?', whereArgs: [lid]);
    await db.delete('trip_members', where: 'ledger_id = ?', whereArgs: [lid]);
    await db.delete('general_entries', where: 'ledger_id = ?', whereArgs: [lid]);
    await db.delete('work_entries', where: 'ledger_id = ?', whereArgs: [lid]);
    await db.delete('ledgers', where: 'id = ?', whereArgs: [lid]);
  }

  Future<void> clearAll() async {
    final db = await _db.database;
    await db.delete('ledgers');
  }
}
