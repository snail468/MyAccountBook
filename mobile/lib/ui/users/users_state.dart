import 'package:flutter/foundation.dart';

/// 用户（内存态，仅本地展示，无后端持久化）。
class AppUser {
  final String name;
  final String role; // admin | member
  final String joinedDate;
  final bool isSelf;

  const AppUser({
    required this.name,
    required this.role,
    required this.joinedDate,
    required this.isSelf,
  });

  AppUser copyWith({
    String? name,
    String? role,
    String? joinedDate,
    bool? isSelf,
  }) =>
      AppUser(
        name: name ?? this.name,
        role: role ?? this.role,
        joinedDate: joinedDate ?? this.joinedDate,
        isSelf: isSelf ?? this.isSelf,
      );
}

/// 用户管理页状态（in-memory，无后端，数据仅存于本次会话）。
class UsersState extends ChangeNotifier {
  List<AppUser> _users = <AppUser>[];

  List<AppUser> get users => _users;

  void add(String name, String password) {
    _users.add(AppUser(
      name: name,
      role: 'member',
      joinedDate: _today(),
      isSelf: false,
    ));
    notifyListeners();
  }

  void remove(AppUser u) {
    _users.remove(u);
    notifyListeners();
  }

  /// 管理员 <-> 成员 切换。
  void cycleRole(AppUser u) {
    final idx = _users.indexOf(u);
    if (idx < 0) return;
    final next = u.role == 'admin' ? 'member' : 'admin';
    _users[idx] = u.copyWith(role: next);
    notifyListeners();
  }

  /// 重置密码（仅提示，无实际改密逻辑）。
  void resetPassword(AppUser u) {
    notifyListeners();
  }

  Future<void> load() async {
    notifyListeners();
  }

  static String _today() {
    final d = DateTime.now();
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }
}
