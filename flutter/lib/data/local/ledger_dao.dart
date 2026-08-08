import 'package:sqflite/sqflite.dart';
import '../db/database.dart';
import '../models/ledger.dart';

/// 账本本地读写。
class LedgerDao {
  final AppDatabase _db = AppDatabase.instance;

  Future<void> upsert(Ledger l) async {
    final db = await _db.database;
    await db.insert(
      'ledgers',
      l.toDb(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<Ledger?> getById(String id) async {
    final db = await _db.database;
    final rows = await db.query('ledgers', where: 'id = ?', whereArgs: [id]);
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

  Future<void> clearAll() async {
    final db = await _db.database;
    await db.delete('ledgers');
  }
}
