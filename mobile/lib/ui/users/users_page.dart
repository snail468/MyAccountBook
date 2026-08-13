import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../theme/design_tokens.dart';
import '../../state/theme_state.dart';
import '../../state/auth_state.dart';
import '../../api/api_client.dart';
import '../../api/admin_api.dart';
import '../../core/exceptions.dart';
import '../../data/local/family_member_dao.dart';
import '../../data/models/app_user.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/page_header.dart';

/// 用户管理页（设计 2:137 / 网页 src/app/admin）。
///
/// 本地优先：家庭成员读写走 [FamilyMemberDao]（本地 [family_members] 表，
/// 与登录用的 users 表隔离）。角色切换 / 删除直接落库。无新依赖。
class UsersPage extends StatefulWidget {
  const UsersPage({super.key});

  @override
  State<UsersPage> createState() => _UsersPageState();
}

class _UsersPageState extends State<UsersPage> {
  final List<AppUser> _users = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool background = false}) async {
    final auth = context.read<AuthState>();
    final isAdmin = auth.role == 'admin';

    // 阶段一：先用本地 family_members 即时展示，避免每次进入都重新加载转圈 [#6]
    if (!background) {
      final local = await FamilyMemberDao().listAll();
      if (!mounted) return;
      _setUsers(local, auth);
      _loading = false;
      setState(() {});
    }

    // 阶段二：管理员在线拉取服务端全量用户并落地本地（按 username 去重），
    // 从而看到所有用户；普通用户只看到自己。服务端 GET /api/admin/users 本身
    // requireAdmin，这里提前按本地角色判定，避免无谓请求。[#6]
    if (isAdmin) {
      try {
        final serverUsers = await AdminApi(ApiClient.instance).listUsers();
        final dao = FamilyMemberDao();
        for (final su in serverUsers) {
          final name = su['username'] as String?;
          if (name == null || name.isEmpty) continue;
          // 服务端角色枚举为 'admin' / 'user'，兜底必须对齐，不能用本地 'member' [#6]
          final role = (su['role'] as String?) ?? 'user';
          final joined = _isoToDate(su['joinedAt'] as String?);
          final existing = await dao.findByName(name);
          if (existing == null) {
            await dao.insert(AppUser(
              id: su['id']?.toString() ?? const Uuid().v4(),
              name: name,
              role: role,
              joinedDate: joined,
              isSelf: false,
            ));
          } else {
            await dao.update(existing.copyWith(role: role, joinedDate: joined));
          }
        }
      } catch (_) {
        // 离线或鉴权失败：忽略，沿用本地 family_members。
      }
    }

    final list = await FamilyMemberDao().listAll();
    if (!mounted) return;
    _setUsers(list, auth);
    _loading = false;
    setState(() {});
  }

  /// 用本地列表构建展示用 _users，并注入当前登录用户（标记「（我）」）。[#6]
  void _setUsers(List<AppUser> list, AuthState auth) {
    if (auth.username != null && auth.username!.isNotEmpty) {
      final idx = list.indexWhere((u) => u.name == auth.username);
      if (idx >= 0) {
        list[idx] = list[idx].copyWith(isSelf: true);
      } else {
        list.insert(
          0,
          AppUser(
            id: 'self',
            name: auth.username!,
            role: auth.role,
            joinedDate: _today(),
            isSelf: true,
          ),
        );
      }
    }
    _users
      ..clear()
      ..addAll(list);
  }

  String _errMsg(Object e) => e is ApiException ? e.message : e.toString();

  Future<void> _add(String name, String role, String password) async {
    try {
      await AdminApi(ApiClient.instance).createUser(name, password, role);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('已创建用户')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('创建失败：${_errMsg(e)}')),
      );
    }
  }

  /// 重置某用户密码（对齐网页端 AdminUserList.resetPwd：先输入新密码 ≥ 6 位，
  /// 确认后调用服务端 PATCH /api/admin/users/[id]，强制对方下线）。[#6]
  Future<void> _resetPassword(AppUser u) async {
    final newPwd = await _promptPassword(
      context,
      title: '重置「${u.name}」的密码',
      hint: '新密码（≥ 6 位）',
    );
    if (newPwd == null || !mounted) return;
    if (newPwd.length < 6) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('密码至少 6 位')),
        );
      }
      return;
    }
    final ok = await _confirm(
      context,
      title: '重置「${u.name}」的密码？',
      body: '新密码：$newPwd\n对方需要用这个新密码登录。',
      confirmText: '重置',
    );
    if (!ok || !mounted) return;
    try {
      await AdminApi(ApiClient.instance).resetPassword(u.id, newPwd);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('已重置')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('重置失败：${_errMsg(e)}')),
      );
    }
  }

  Future<void> _cycleRole(AppUser u) async {
    // 降级时发 'user'（服务端枚举为 'admin'/'user'，'member' 会被 400 拒绝）[#6]
    final next = u.role == 'admin' ? 'user' : 'admin';
    try {
      // 服务端升降级（PATCH /api/admin/users/[id]），随后重新拉取，
      // 使改动真正生效并在列表刷新（本地 family_members 仅是缓存）。[#6]
      await AdminApi(ApiClient.instance).setRole(u.id, next);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(next == 'admin' ? '已升为管理员' : '已降级为普通用户')),
      );
      await _load(background: true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('操作失败：${_errMsg(e)}')),
      );
    }
  }

  Future<void> _remove(AppUser u) async {
    final ok = await _confirm(
      context,
      title: '删除用户「${u.name}」？',
      body: '该用户的所有账本数据会一并清除，且不可恢复。',
      confirmText: '删除',
    );
    if (!ok || !mounted) return;
    try {
      // 服务端删除（DELETE /api/admin/users/[id]），随后重新拉取。[#6]
      await AdminApi(ApiClient.instance).deleteUser(u.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('已删除')));
      await _load(background: true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('删除失败：${_errMsg(e)}')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    context.watch<ThemeState>();
    final auth = context.watch<AuthState>();
    final isAdmin = auth.role == 'admin';
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final blue = isDark ? AppColors.darkSemanticBlue : AppColors.lightSemanticBlue;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    return Scaffold(
      backgroundColor: pageBg,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
                const PageHeader(
                  icon: '👥',
                  title: '用户管理',
                  subtitle: '家庭成员 · 角色与权限',
                ),
                if (isAdmin)
                  AppPrimaryButton(
                    label: '+ 新建用户',
                    onPressed: () => showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => _AddUserSheet(
                        onSave: (name, role, password) async {
                          await _add(name, role, password);
                          if (mounted) Navigator.of(context).pop();
                        },
                      ),
                    ).then((_) {
                      if (mounted) _load();
                    }),
                  ),
                if (isAdmin) const SizedBox(height: 8),
                if (_loading)
                  _hint('加载中…', ink400)
                else if (_users.isEmpty)
                  _hint(isAdmin ? '还没有其他用户' : '仅能看到你自己', ink500)
                else
                  ..._users.map(
                    (u) => _UserTile(
                      user: u,
                      ink900: ink900,
                      ink500: ink500,
                      ink400: ink400,
                      blue: blue,
                      red: red,
                      canManage: isAdmin,
                      onCycle: _cycleRole,
                      onReset: _resetPassword,
                      onRemove: _remove,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Widget _hint(String text, Color color) => Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text(text, style: TextStyle(color: color, fontSize: 13)),
    );

String _today() {
  final d = DateTime.now();
  return '${d.year}-${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

/// 服务端 ISO 时间 → 本地展示用 'yyyy-MM-dd'；解析失败回退今天。[#6]
String _isoToDate(String? iso) {
  if (iso == null || iso.isEmpty) return _today();
  try {
    final d = DateTime.parse(iso);
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  } catch (_) {
    return _today();
  }
}

class _UserTile extends StatelessWidget {
  final AppUser user;
  final Color ink900;
  final Color ink500;
  final Color ink400;
  final Color blue;
  final Color red;
  final bool canManage;
  final Future<void> Function(AppUser) onCycle;
  final Future<void> Function(AppUser) onReset;
  final Future<void> Function(AppUser) onRemove;

  const _UserTile({
    required this.user,
    required this.ink900,
    required this.ink500,
    required this.ink400,
    required this.blue,
    required this.red,
    this.canManage = true,
    required this.onCycle,
    required this.onReset,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final isAdmin = user.role == 'admin';
    final deletable = !user.isSelf;
    final canCycle = !user.isSelf;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        frosted: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Text(user.name,
                            style: TextStyle(color: ink900, fontSize: 15)),
                        if (user.isSelf) ...[
                          const SizedBox(width: 8),
                          Text('（我）', style: TextStyle(color: ink400, fontSize: 13)),
                        ],
                      ],
                    ),
                  ),
                  if (isAdmin)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: blue,
                        borderRadius: BorderRadius.circular(999),
                      ),
                        child: const Text('管理员',
                            style: TextStyle(color: AppColors.lightSurface, fontSize: 12)),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Text('加入 ${user.joinedDate}',
                  style: TextStyle(color: ink500, fontSize: 13)),
              const SizedBox(height: 8),
              if (canManage)
                Row(
                  children: [
                    GestureDetector(
                      onTap: () => onReset(user),
                      child: Text('重置密码',
                          style: TextStyle(color: ink500, fontSize: 13)),
                    ),
                    const SizedBox(width: 16),
                    GestureDetector(
                      onTap: canCycle ? () => onCycle(user) : null,
                      child: Text(isAdmin ? '降级为普通用户' : '升为管理员',
                          style: TextStyle(
                              color: canCycle ? ink500 : ink400, fontSize: 13)),
                    ),
                    const SizedBox(width: 16),
                    GestureDetector(
                      onTap: deletable ? () => onRemove(user) : null,
                      child: Text('删除',
                          style: TextStyle(
                              color: deletable ? red : ink400, fontSize: 13)),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoleChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _RoleChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final fill = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final textOn = isDark ? AppColors.darkCtaText : AppColors.lightSurface;
    final border =
        isDark ? AppColors.darkBorder : AppColors.lightBorder;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: selected ? fill : Colors.transparent,
          border: Border.all(color: selected ? fill : border),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Center(
          child: Text(label,
              style: TextStyle(
                  color: selected ? textOn : ink900, fontSize: 14)),
        ),
      ),
    );
  }
}

class _AddUserSheet extends StatefulWidget {
  final Future<void> Function(String name, String role, String password) onSave;

  const _AddUserSheet({required this.onSave});

  @override
  State<_AddUserSheet> createState() => _AddUserSheetState();
}

class _AddUserSheetState extends State<_AddUserSheet> {
  final _name = TextEditingController();
  final _password = TextEditingController();
  // 默认值对齐服务端枚举 'user'（'member' 会被服务端 400 拒绝）[#6]
  String _role = 'user';

  @override
  void dispose() {
    _name.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('新建用户',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          AppTextField(hint: '用户名', controller: _name),
          const SizedBox(height: 12),
          AppTextField(
            hint: '密码（≥ 6 位）',
            obscure: true,
            controller: _password,
          ),
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(
              border: Border.all(color: border),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(
                  child: _RoleChip(
                    label: '普通用户',
                    selected: _role == 'user',
                    onTap: () => setState(() => _role = 'user'),
                  ),
                ),
                Expanded(
                  child: _RoleChip(
                    label: '管理员',
                    selected: _role == 'admin',
                    onTap: () => setState(() => _role = 'admin'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          AppPrimaryButton(
            label: '保存',
            onPressed: () async {
              final name = _name.text.trim();
              final password = _password.text;
              if (name.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('请填写用户名')),
                );
                return;
              }
              if (password.length < 6) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('密码至少 6 位')),
                );
                return;
              }
              await widget.onSave(name, _role, password);
            },
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

Future<bool> _confirm(
  BuildContext context, {
  required String title,
  required String body,
  String confirmText = '确认',
}) async {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('取消'),
        ),
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(confirmText, style: TextStyle(color: red)),
        ),
      ],
    ),
  );
  return confirmed ?? false;
}

/// 输入密码的对话框（对齐网页端 resetPwd 的 window.prompt 输入新密码）。
/// 返回输入的密码；取消/关闭返回 null。
Future<String?> _promptPassword(
  BuildContext context, {
  required String title,
  required String hint,
}) async {
  final ctl = TextEditingController();
  final isDark = Theme.of(context).brightness == Brightness.dark;
  final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
  String? result;
  await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: AppTextField(
        hint: hint,
        obscure: true,
        controller: ctl,
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('取消'),
        ),
        TextButton(
          onPressed: () {
            result = ctl.text;
            Navigator.of(ctx).pop(true);
          },
          child: Text('确定', style: TextStyle(color: red)),
        ),
      ],
    ),
  );
  ctl.dispose();
  return result;
}
