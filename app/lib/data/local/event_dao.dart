import '../db/database.dart';
import '../models/taoyuan_event.dart';

/// 桃源账本：活动与金额本地读写。
class EventDao {
  final AppDatabase _db = AppDatabase.instance;

  /// 插入；拉取同步时用 [ConflictAlgorithm.replace] 按 id 覆盖已存在行。
  Future<void> insertEvent(TaoyuanEvent e) async {
    final db = await _db.database;
    await db.insert('taoyuan_events', e.toDb(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<TaoyuanEvent>> listByLedger(String ledgerId,
      {bool descending = true}) async {
    final db = await _db.database;
    final rows = await db.query(
      'taoyuan_events',
      where: 'ledger_id = ? AND deleted_at IS NULL',
      whereArgs: [ledgerId],
      orderBy: descending ? 'published_at DESC' : 'published_at ASC',
    );
    return rows.map(TaoyuanEvent.fromDb).toList();
  }

  Future<TaoyuanEvent?> getById(String id) async {
    final db = await _db.database;
    final rows =
        await db.query('taoyuan_events', where: 'id = ?', whereArgs: [id]);
    if (rows.isEmpty) return null;
    return TaoyuanEvent.fromDb(rows.first);
  }

  Future<void> softDeleteEvent(String id) async {
    final db = await _db.database;
    await db.update(
      'taoyuan_events',
      {'deleted_at': DateTime.now().millisecondsSinceEpoch, 'synced': 0},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> markEventSynced(String localId, String serverId) async {
    final db = await _db.database;
    await db.update(
      'taoyuan_events',
      {'synced': 1, 'server_id': serverId},
      where: 'id = ?',
      whereArgs: [localId],
    );
  }

  /// 插入金额；拉取同步时用 [ConflictAlgorithm.replace] 按 id 覆盖已存在行。
  Future<void> insertAmount(EventAmount a) async {
    final db = await _db.database;
    await db.insert('event_amounts', a.toDb(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  /// 删除某活动的全部金额（拉取前先清，再按服务端重建）。
  Future<void> deleteAmountsByEvent(String eventId) async {
    final db = await _db.database;
    await db.delete('event_amounts', where: 'event_id = ?', whereArgs: [eventId]);
  }

  Future<List<EventAmount>> listAmounts(String eventId) async {
    final db = await _db.database;
    final rows = await db.query(
      'event_amounts',
      where: 'event_id = ? AND deleted_at IS NULL',
      whereArgs: [eventId],
      orderBy: 'occurred_at ASC',
    );
    return rows.map(EventAmount.fromDb).toList();
  }
}
