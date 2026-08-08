import 'package:sqflite/sqflite.dart';
import '../db/database.dart';
import '../models/recurring_rule.dart';

/// 周期记账规则本地读写（对应 recurring_rules 表）。
class RecurringRuleDao {
  final AppDatabase _db = AppDatabase.instance;

  Future<void> insert(RecurringRule r) async {
    final db = await _db.database;
    await db.insert('recurring_rules', r.toDb(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<RecurringRule>> listAll() async {
    final db = await _db.database;
    final rows = await db.query('recurring_rules', orderBy: 'next_date ASC');
    return rows.map(RecurringRule.fromDb).toList();
  }

  Future<void> delete(String id) async {
    final db = await _db.database;
    await db.delete('recurring_rules', where: 'id = ?', whereArgs: [id]);
  }
}
