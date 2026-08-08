import 'package:sqflite/sqflite.dart';
import '../db/database.dart';
import '../models/bank_card.dart';

/// 银行卡本地读写（仅后四位落库）。
class BankCardDao {
  final AppDatabase _db = AppDatabase.instance;

  /// 插入；按 id 覆盖已存在行。
  Future<void> insert(BankCard c) async {
    final db = await _db.database;
    await db.insert('bank_cards', c.toDb(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  /// 全部银行卡，按创建时间升序。
  Future<List<BankCard>> listAll() async {
    final db = await _db.database;
    final rows = await db.query('bank_cards', orderBy: 'created_at ASC');
    return rows.map(BankCard.fromDb).toList();
  }

  Future<void> delete(String id) async {
    final db = await _db.database;
    await db.delete('bank_cards', where: 'id = ?', whereArgs: [id]);
  }
}
