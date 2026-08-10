import 'package:sqflite/sqflite.dart';
import '../db/database.dart';
import '../models/trip.dart';

/// 旅游账本：成员 / 花费 / 分摊 本地读写 + AA 结算计算。
class TripDao {
  final AppDatabase _db = AppDatabase.instance;

  // ---- 成员 ----
  /// 插入；拉取同步时用 [ConflictAlgorithm.replace] 按 id 覆盖已存在行。
  Future<void> insertMember(TripMember m) async {
    final db = await _db.database;
    await db.insert('trip_members', m.toDb(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<TripMember>> listMembers(String ledgerId) async {
    final db = await _db.database;
    final rows = await db.query(
      'trip_members',
      where: 'ledger_id = ?',
      whereArgs: [ledgerId],
      orderBy: 'display_name ASC',
    );
    return rows.map(TripMember.fromDb).toList();
  }

  Future<void> markMemberSettled(String id, bool settled) async {
    final db = await _db.database;
    await db.update(
      'trip_members',
      {'settled': settled ? 1 : 0, 'synced': 0},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<TripMember?> getMemberById(String id) async {
    final db = await _db.database;
    final rows = await db.query('trip_members', where: 'id = ?', whereArgs: [id]);
    if (rows.isEmpty) return null;
    return TripMember.fromDb(rows.first);
  }

  Future<void> deleteMember(String id) async {
    final db = await _db.database;
    await db.delete('trip_members', where: 'id = ?', whereArgs: [id]);
  }

  /// 按 id 更新成员（编辑姓名/状态后本地回写）。
  Future<void> updateMember(TripMember m) async {
    final db = await _db.database;
    await db.update('trip_members', m.toDb(), where: 'id = ?', whereArgs: [m.id]);
  }

  Future<void> markMemberSynced(String localId, String serverId) async {
    final db = await _db.database;
    await db.update(
      'trip_members',
      {'synced': 1, 'server_id': serverId},
      where: 'id = ?',
      whereArgs: [localId],
    );
  }

  // ---- 花费 ----
  /// 插入；拉取同步时用 [ConflictAlgorithm.replace] 按 id 覆盖已存在行。
  Future<void> insertExpense(TripExpense e) async {
    final db = await _db.database;
    await db.insert('trip_expenses', e.toDb(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  /// 按 id 更新一笔花费（编辑后本地回写；sync 标记置 0 触发重新同步）。
  Future<void> updateExpense(TripExpense e) async {
    final db = await _db.database;
    await db
        .update('trip_expenses', e.toDb(), where: 'id = ?', whereArgs: [e.id]);
  }

  Future<List<TripExpense>> listExpenses(String ledgerId) async {
    final db = await _db.database;
    final rows = await db.query(
      'trip_expenses',
      where: 'ledger_id = ? AND deleted_at IS NULL',
      whereArgs: [ledgerId],
      orderBy: 'occurred_at DESC',
    );
    return rows.map(TripExpense.fromDb).toList();
  }

  Future<void> softDeleteExpense(String id) async {
    final db = await _db.database;
    await db.update(
      'trip_expenses',
      {'deleted_at': DateTime.now().millisecondsSinceEpoch, 'synced': 0},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> markExpenseSynced(String localId, String serverId) async {
    final db = await _db.database;
    await db.update(
      'trip_expenses',
      {'synced': 1, 'server_id': serverId},
      where: 'id = ?',
      whereArgs: [localId],
    );
  }

  /// 拉取对账：删本地已同步但服务端已移除的成员；不动未同步的本地占位。
  Future<void> deleteSyncedMembersNotIn(
      String ledgerId, Set<String> serverIds) async {
    final db = await _db.database;
    if (serverIds.isEmpty) {
      await db.delete('trip_members',
          where: 'ledger_id = ? AND server_id IS NOT NULL', whereArgs: [ledgerId]);
      return;
    }
    final ph = List.filled(serverIds.length, '?').join(',');
    await db.delete(
      'trip_members',
      where:
          'ledger_id = ? AND server_id IS NOT NULL AND server_id NOT IN ($ph)',
      whereArgs: [ledgerId, ...serverIds],
    );
  }

  /// 拉取对账：删本地已同步但服务端已移除的花费；先清其分摊(引用 expense_id)，
  /// 再清花费本身。不动未同步的本地新建。
  Future<void> deleteSyncedExpensesNotIn(
      String ledgerId, Set<String> serverIds) async {
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
    await db.delete('trip_splits',
        where: 'expense_id IN (SELECT id FROM trip_expenses WHERE $ph)',
        whereArgs: args);
    await db.delete('trip_expenses', where: ph, whereArgs: args);
  }

  // ---- 分摊 ----
  Future<void> insertSplit(TripSplit s) async {
    final db = await _db.database;
    await db.insert('trip_splits', s.toDb());
  }

  Future<List<TripSplit>> listSplits(String expenseId) async {
    final db = await _db.database;
    final rows = await db
        .query('trip_splits', where: 'expense_id = ?', whereArgs: [expenseId]);
    return rows.map(TripSplit.fromDb).toList();
  }

  /// 删除某花费的全部分摊（拉取前先清，再按服务端重建）。
  Future<void> deleteSplitsForExpense(String expenseId) async {
    final db = await _db.database;
    await db.delete('trip_splits', where: 'expense_id = ?', whereArgs: [expenseId]);
  }

  /// 计算 AA 结算：返回谁该转给谁多少（分）。采用"最大余额法"。
  ///
  /// [paid] 某人垫付总额（本币），[owed] 某人应承担总额（本币）。
  /// 净额 = paid - owed：正=别人欠他，负=他欠别人。
  static List<({String fromId, String toId, int amountCents})> settle(
    Map<String, int> paid,
    Map<String, int> owed,
  ) {
    final ids = <String>{...paid.keys, ...owed.keys};
    final balances = <String, int>{};
    for (final id in ids) {
      balances[id] = (paid[id] ?? 0) - (owed[id] ?? 0);
    }
    final creditors = <({String id, int amt})>[];
    final debtors = <({String id, int amt})>[];
    for (final e in balances.entries) {
      if (e.value > 0) creditors.add((id: e.key, amt: e.value));
      if (e.value < 0) debtors.add((id: e.key, amt: -e.value));
    }
    creditors.sort((a, b) => b.amt.compareTo(a.amt));
    debtors.sort((a, b) => b.amt.compareTo(a.amt));

    final result = <({String fromId, String toId, int amountCents})>[];
    var ci = 0;
    var di = 0;
    while (ci < creditors.length && di < debtors.length) {
      final c = creditors[ci];
      final d = debtors[di];
      final pay = c.amt < d.amt ? c.amt : d.amt;
      if (pay > 0) {
        result.add((fromId: d.id, toId: c.id, amountCents: pay));
      }
      creditors[ci] = (id: c.id, amt: c.amt - pay);
      debtors[di] = (id: d.id, amt: d.amt - pay);
      if (creditors[ci].amt == 0) ci++;
      if (debtors[di].amt == 0) di++;
    }
    return result;
  }
}
