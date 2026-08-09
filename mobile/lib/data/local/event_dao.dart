import 'package:sqflite/sqflite.dart';
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

  /// 拉取对账：删本地已同步但服务端已不存在的活动；先清其金额(引用 event_id)，
  /// 再清活动本身。不动未同步的本地新建。
  Future<void> deleteSyncedNotIn(String ledgerId, Set<String> serverIds) async {
    final db = await _db.database;
    late final String ph;
    late final List<Object?> args;
    if (serverIds.isEmpty) {
      ph = 'ledger_id = ? AND server_id IS NOT NULL';
      args = [ledgerId];
    } else {
      ph =
          'ledger_id = ? AND server_id IS NOT NULL AND server_id NOT IN (${List.filled(serverIds.length, '?').join(',')})';
      args = [ledgerId, ...serverIds];
    }
    await db.delete('event_amounts',
        where: 'event_id IN (SELECT id FROM taoyuan_events WHERE $ph)',
        whereArgs: args);
    await db.delete('taoyuan_events', where: ph, whereArgs: args);
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
