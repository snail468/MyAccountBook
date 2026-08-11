import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../../data/local/family_member_dao.dart';
import '../../data/models/app_user.dart';

export '../../data/models/app_user.dart';

/// 用户管理页状态（本地持久化到 family_members 表）。
class UsersState extends ChangeNotifier {
  List<AppUser> _users = <AppUser>[];

  List<AppUser> get users => _users;

  Future<void> add(String name, String password) async {
    final u = AppUser(
      id: const Uuid().v4(),
      name: name,
      role: 'member',
      joinedDate: _today(),
      isSelf: false,
      password: password,
    );
    await FamilyMemberDao().insert(u);
    _users.add(u);
    notifyListeners();
  }

  Future<void> remove(AppUser u) async {
    await FamilyMemberDao().delete(u.id);
    _users.removeWhere((e) => e.id == u.id);
    notifyListeners();
  }

  /// 管理员 <-> 成员 切换（持久化到本地）。
  Future<void> cycleRole(AppUser u) async {
    final idx = _users.indexWhere((e) => e.id == u.id);
    if (idx < 0) return;
    final next = u.role == 'admin' ? 'member' : 'admin';
    final updated = u.copyWith(role: next);
    _users[idx] = updated;
    await FamilyMemberDao().update(updated);
    notifyListeners();
  }

  /// 重置密码（对齐网页端 AdminUserList.resetPwd：落库 family_members.password）。
  Future<void> resetPassword(AppUser u, String newPassword) async {
    final updated = u.copyWith(password: newPassword);
    final idx = _users.indexWhere((e) => e.id == u.id);
    if (idx >= 0) _users[idx] = updated;
    await FamilyMemberDao().update(updated);
    notifyListeners();
  }

  Future<void> load() async {
    final list = await FamilyMemberDao().listAll();
    _users = list;
    notifyListeners();
  }

  static String _today() {
    final d = DateTime.now();
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }
}
