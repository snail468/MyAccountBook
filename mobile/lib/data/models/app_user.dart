/// 家庭成员 / 用户（本地持久化，对应 family_members 表）。
///
/// 与 auth 用的 `users` 表不同：family_members 仅用于"家庭/成员管理"展示，
/// 记录昵称、角色与加入日期，可离线增删改。
class AppUser {
  final String id; // 本地 id
  final String name;
  final String role; // admin | member
  final String joinedDate;
  final bool isSelf;
  /// 登录密码（本地存储，对齐网页端创建用户/重置密码时的 password 字段）。
  /// 仅本地 family_members 表持有，与 auth 的 users 表隔离。
  final String? password;

  const AppUser({
    required this.id,
    required this.name,
    required this.role,
    required this.joinedDate,
    required this.isSelf,
    this.password,
  });

  AppUser copyWith({
    String? id,
    String? name,
    String? role,
    String? joinedDate,
    bool? isSelf,
    String? password,
  }) =>
      AppUser(
        id: id ?? this.id,
        name: name ?? this.name,
        role: role ?? this.role,
        joinedDate: joinedDate ?? this.joinedDate,
        isSelf: isSelf ?? this.isSelf,
        password: password ?? this.password,
      );

  factory AppUser.fromDb(Map<String, dynamic> m) => AppUser(
        id: m['id'] as String,
        name: m['name'] as String,
        role: m['role'] as String,
        joinedDate: m['joined_date'] as String,
        isSelf: (m['is_self'] as int? ?? 0) == 1,
        password: m['password'] as String?,
      );

  Map<String, dynamic> toDb() => {
        'id': id,
        'name': name,
        'role': role,
        'joined_date': joinedDate,
        'is_self': isSelf ? 1 : 0,
        'password': password,
        'created_at': DateTime.now().millisecondsSinceEpoch,
      };
}
