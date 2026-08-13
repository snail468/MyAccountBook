import 'package:sqflite/sqflite.dart';
import '../db/database.dart';
import '../models/general_entry.dart';
import '../models/stats_row.dart';

/// 环比同比所需的「当前月 / 上月 / 去年同月」收入与支出聚合（全账本，单位分）。
class PeriodComparison {
  final int curIncome, curExpense, prevIncome, prevExpense, yoyIncome, yoyExpense;
  const PeriodComparison({
    required this.curIncome,
    required this.curExpense,
    required this.prevIncome,
    required this.prevExpense,
    required this.yoyIncome,
    required this.yoyExpense,
  });
}

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

  /// 同步专用：含已软删行，用于建立 server_id -> local_id 映射，
  /// 避免服务端软删条目因本地查不到而重复插入。
  Future<List<GeneralEntry>> listByLedgerIncludingDeleted(String ledgerId) async {
    final db = await _db.database;
    final rows = await db.query(
      'general_entries',
      where: 'ledger_id = ?',
      whereArgs: [ledgerId],
      orderBy: 'occurred_at DESC',
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

  /// 回收站：返回所有已软删的条目（按删除时间倒序）。[ledgerId] 为空则跨全部账本。
  Future<List<GeneralEntry>> listDeleted({String? ledgerId}) async {
    final db = await _db.database;
    final rows = await db.query(
      'general_entries',
      where: ledgerId == null
          ? 'deleted_at IS NOT NULL'
          : 'ledger_id = ? AND deleted_at IS NOT NULL',
      whereArgs: ledgerId == null ? null : [ledgerId],
      orderBy: 'deleted_at DESC',
    );
    return rows.map(GeneralEntry.fromDb).toList();
  }

  /// 恢复：清除删除标记（deleted_at 置 NULL）。
  Future<void> restore(String id) async {
    final db = await _db.database;
    await db.update(
      'general_entries',
      {'deleted_at': null, 'synced': 0},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// 彻底删除（物理删除，不可恢复）。
  Future<void> hardDelete(String id) async {
    final db = await _db.database;
    await db.delete('general_entries', where: 'id = ?', whereArgs: [id]);
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

  /// 拉取对账：删本地「已同步(server_id 非空)」但服务端已不存在(serverId 不在
  /// [serverIds])的行。绝不删未同步(server_id 为 null)的本地行（待推送的新建）。
  Future<void> deleteSyncedNotIn(String ledgerId, Set<String> serverIds) async {
    final db = await _db.database;
    if (serverIds.isEmpty) {
      await db.delete('general_entries',
          where: 'ledger_id = ? AND server_id IS NOT NULL', whereArgs: [ledgerId]);
      return;
    }
    final ph = List.filled(serverIds.length, '?').join(',');
    await db.delete(
      'general_entries',
      where:
          'ledger_id = ? AND server_id IS NOT NULL AND server_id NOT IN ($ph)',
      whereArgs: [ledgerId, ...serverIds],
    );
  }

  /// 累计收入/支出合计（分），不限月份 —— 首页"总收入 A"的分量用。
  Future<({int income, int expense})> cumulativeTotals(
      String ledgerId) async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      '''SELECT direction, SUM(amount_cents) AS s
         FROM general_entries
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

  /// 某时间段内的分类支出合计（分），按 category 聚合 —— 分类预算超支检测用。
  Future<Map<String, int>> categorySpend(
      String ledgerId, int start, int end) async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      '''SELECT category, SUM(amount_cents) AS s
         FROM general_entries
         WHERE ledger_id = ? AND deleted_at IS NULL AND direction = 'expense'
           AND occurred_at >= ? AND occurred_at < ?
         GROUP BY category''',
      [ledgerId, start, end],
    );
    final map = <String, int>{};
    for (final r in rows) {
      map[r['category'] as String] = (r['s'] as num?)?.toInt() ?? 0;
    }
    return map;
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

  /// 全部普通账本的收入 / 支出合计（分）。统计页总额用。
  Future<({int income, int expense})> totalsAll() async {
    final db = await _db.database;
    final rows = await db.rawQuery('''
      SELECT direction, SUM(amount_cents) AS s
      FROM general_entries
      WHERE deleted_at IS NULL
      GROUP BY direction
    ''');
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

  /// 最近 [months] 个月的收入 / 支出趋势（分），升序返回连续 [months] 个 YYYY-MM。
  Future<List<({String month, int income, int expense})>> monthlyTrend(
      {int months = 12}) async {
    final db = await _db.database;
    final now = DateTime.now();
    final startD = DateTime(now.year, now.month - (months - 1), 1);
    final start = startD.millisecondsSinceEpoch;
    final end = DateTime(now.year, now.month + 1, 1).millisecondsSinceEpoch;
    final rows = await db.rawQuery('''
      SELECT occurred_at, direction, amount_cents
      FROM general_entries
      WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ?
    ''', [start, end]);

    final byMonth =
        <String, ({int income, int expense})>{};
    for (final r in rows) {
      final millis = r['occurred_at'] as int;
      final d = DateTime.fromMillisecondsSinceEpoch(millis);
      final ym = '${d.year}-${d.month.toString().padLeft(2, '0')}';
      final dir = r['direction'] as String;
      final sum = (r['amount_cents'] as num?)?.toInt() ?? 0;
      final cur = byMonth[ym] ?? (income: 0, expense: 0);
      byMonth[ym] = dir == 'income'
          ? (income: cur.income + sum, expense: cur.expense)
          : (income: cur.income, expense: cur.expense + sum);
    }

    final result = <({String month, int income, int expense})>[];
    for (var i = 0; i < months; i++) {
      final d = DateTime(startD.year, startD.month + i, 1);
      final ym = '${d.year}-${d.month.toString().padLeft(2, '0')}';
      final v = byMonth[ym] ?? (income: 0, expense: 0);
      result.add((month: ym, income: v.income, expense: v.expense));
    }
    return result;
  }

  /// 支出按类别占比（分），降序。
  Future<List<({String label, int cents})>> categoryBreakdown() async {
    final db = await _db.database;
    final rows = await db.rawQuery('''
      SELECT category, SUM(amount_cents) AS s
      FROM general_entries
      WHERE deleted_at IS NULL AND direction = 'expense'
      GROUP BY category
      ORDER BY s DESC
    ''');
    return rows.map((r) => (
          label: r['category'] as String,
          cents: (r['s'] as num?)?.toInt() ?? 0,
        )).toList();
  }

  /// 统计聚合用：返回窗口内（occurred_at >= [since]）全部普通账本条目的归一化记录。
  /// income / expense 两个方向都包含。对齐网页端 loadRows 的 generals 分支。
  Future<List<StatRow>> statsRows(int since) async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      '''SELECT occurred_at, amount_cents, direction, category
         FROM general_entries
         WHERE deleted_at IS NULL AND occurred_at >= ?''',
      [since],
    );
    return rows.map((r) => StatRow(
      occurredAt: DateTime.fromMillisecondsSinceEpoch(r['occurred_at'] as int),
      amountCents: (r['amount_cents'] as num?)?.toInt() ?? 0,
      direction: (r['direction'] as String?) ?? 'expense',
      category: (r['category'] as String?) ?? '未分类',
    )).toList();
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

  /// 当前月 / 上月 / 去年同月的收入与支出（分）。环比同比卡用。
  ///
  /// 单次 rawQuery 用 CASE 同时聚合三个月，避免三次查询。
  /// 当前月 = 本地日历当月；上月 = 上一月（Dart 自动处理跨年）；同比 = 去年同月。
  Future<PeriodComparison> periodComparison() async {
    final db = await _db.database;
    final now = DateTime.now();
    final cur = DateTime(now.year, now.month, 1);
    final prev = DateTime(now.year, now.month - 1, 1);
    final yoy = DateTime(now.year - 1, now.month, 1);
    String ym(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}';
    final c0 = _monthStart(ym(cur)), c1 = _monthEnd(ym(cur));
    final p0 = _monthStart(ym(prev)), p1 = _monthEnd(ym(prev));
    final y0 = _monthStart(ym(yoy)), y1 = _monthEnd(ym(yoy));
    final rows = await db.rawQuery('''
      SELECT
        CASE
          WHEN occurred_at >= ? AND occurred_at < ? THEN 'cur'
          WHEN occurred_at >= ? AND occurred_at < ? THEN 'prev'
          WHEN occurred_at >= ? AND occurred_at < ? THEN 'yoy'
        END AS period,
        direction, SUM(amount_cents) AS s
      FROM general_entries
      WHERE deleted_at IS NULL
        AND ((occurred_at >= ? AND occurred_at < ?)
          OR (occurred_at >= ? AND occurred_at < ?)
          OR (occurred_at >= ? AND occurred_at < ?))
      GROUP BY period, direction
    ''', [c0, c1, p0, p1, y0, y1, c0, c1, p0, p1, y0, y1]);
    int acc(String period, String dir) {
      for (final r in rows) {
        if (r['period'] == period && r['direction'] == dir) {
          return (r['s'] as num?)?.toInt() ?? 0;
        }
      }
      return 0;
    }

    return PeriodComparison(
      curIncome: acc('cur', 'income'),
      curExpense: acc('cur', 'expense'),
      prevIncome: acc('prev', 'income'),
      prevExpense: acc('prev', 'expense'),
      yoyIncome: acc('yoy', 'income'),
      yoyExpense: acc('yoy', 'expense'),
    );
  }
}
