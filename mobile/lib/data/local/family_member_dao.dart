import 'package:sqflite/sqflite.dart';
import '../db/database.dart';
import '../models/app_user.dart';

/// 家庭成员 / 用户本地读写（对应 family_members 表）。
class FamilyMemberDao {
  final AppDatabase _db = AppDatabase.instance;

  Future<void> insert(AppUser u) async {
    final db = await _db.database;
    await db.insert('family_members', u.toDb(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<AppUser>> listAll() async {
    final db = await _db.database;
    final rows = await db.query('family_members', orderBy: 'created_at ASC');
    return rows.map(AppUser.fromDb).toList();
  }

  /// 按用户名查找本地家庭成员（用于与服务端用户去重合并）。[#6]
  Future<AppUser?> findByName(String name) async {
    final db = await _db.database;
    final rows = await db.query(
      'family_members',
      where: 'name = ?',
      whereArgs: [name],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return AppUser.fromDb(rows.first);
  }

  Future<void> delete(String id) async {
    final db = await _db.database;
    await db.delete('family_members', where: 'id = ?', whereArgs: [id]);
  }

  /// 更新某条家庭成员（如角色切换）。
  Future<void> update(AppUser u) async {
    final db = await _db.database;
    await db.update('family_members', u.toDb(),
        where: 'id = ?', whereArgs: [u.id]);
  }
}
