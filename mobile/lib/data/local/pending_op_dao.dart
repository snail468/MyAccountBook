import '../db/database.dart';
import '../models/pending_op.dart';

/// 离线队列本地读写。
class PendingOpDao {
  final AppDatabase _db = AppDatabase.instance;

  /// 入队。返回自增主键。
  Future<int> enqueue(PendingOp op) async {
    final db = await _db.database;
    return db.insert('pending_ops', op.toDb());
  }

  /// 取出待同步的操作（按创建顺序）。
  Future<List<PendingOp>> listPending() async {
    final db = await _db.database;
    final rows = await db.query(
      'pending_ops',
      where: 'status = ?',
      whereArgs: ['pending'],
      orderBy: 'created_at ASC',
    );
    return rows.map(PendingOp.fromDb).toList();
  }

  Future<int> pendingCount() async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      'SELECT COUNT(*) AS c FROM pending_ops WHERE status = ?',
      ['pending'],
    );
    return (rows.first['c'] as int?) ?? 0;
  }

  Future<void> markDone(int id) async {
    final db = await _db.database;
    await db.delete('pending_ops', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> markFailed(int id, int attempts) async {
    final db = await _db.database;
    await db.update(
      'pending_ops',
      {'status': 'failed', 'attempts': attempts},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// 同步失败（业务错误标记为 failed）的操作条数。供 UI 提示「有 N 笔未能同步」。
  Future<int> failedCount() async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      'SELECT COUNT(*) AS c FROM pending_ops WHERE status = ?',
      ['failed'],
    );
    return (rows.first['c'] as int?) ?? 0;
  }

  /// 把全部 failed 操作重置回 pending，供用户手动「重试未同步」。
  /// 返回被重置的条数。attempts 计数保留（便于观察反复失败）。
  Future<int> resetFailedToPending() async {
    final db = await _db.database;
    return db.update(
      'pending_ops',
      {'status': 'pending'},
      where: 'status = ?',
      whereArgs: ['failed'],
    );
  }

  Future<void> clearAll() async {
    final db = await _db.database;
    await db.delete('pending_ops');
  }

  /// 删除某个本地实体关联的全部待同步操作（编辑未同步行时用于"重写"）。
  Future<void> removePendingFor(String entityLocalId) async {
    final db = await _db.database;
    await db.delete('pending_ops',
        where: 'entity_local_id = ?', whereArgs: [entityLocalId]);
  }

  /// 读取 pending DELETE 操作中指定实体的 server_id 集合（存入 client_id），
  /// 供拉取对账「保留集」使用，防止离线删除被服务端数据「复活」。[D4]
  Future<Set<String>> pendingDeleteServerIds(List<String> entities) async {
    final db = await _db.database;
    if (entities.isEmpty) return const {};
    final ph = List.filled(entities.length, '?').join(',');
    final rows = await db.query(
      'pending_ops',
      columns: ['client_id'],
      where:
          "status = 'pending' AND method = 'DELETE' AND entity IN ($ph)",
      whereArgs: entities,
    );
    final set = <String>{};
    for (final r in rows) {
      final cid = r['client_id'] as String?;
      if (cid != null && cid.isNotEmpty) set.add(cid);
    }
    return set;
  }
}
