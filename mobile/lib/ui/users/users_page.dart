import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../theme/design_tokens.dart';
import '../../state/theme_state.dart';
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

  Future<void> _load() async {
    final list = await FamilyMemberDao().listAll();
    if (!mounted) return;
    _users
      ..clear()
      ..addAll(list);
    _loading = false;
    setState(() {});
  }

  Future<void> _add(String name, String role) async {
    final u = AppUser(
      id: const Uuid().v4(),
      name: name,
      role: role,
      joinedDate: _today(),
      isSelf: false,
    );
    await FamilyMemberDao().insert(u);
  }

  Future<void> _cycleRole(AppUser u) async {
    final next = u.role == 'admin' ? 'member' : 'admin';
    await FamilyMemberDao().update(u.copyWith(role: next));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(next == 'admin' ? '已升为管理员' : '已降级为普通用户')),
    );
    await _load();
  }

  Future<void> _remove(AppUser u) async {
    final ok = await _confirm(
      context,
      title: '删除用户「${u.name}」？',
      body: '该用户的所有账本数据会一并清除，且不可恢复。',
      confirmText: '删除',
    );
    if (!ok || !mounted) return;
    await FamilyMemberDao().delete(u.id);
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('已删除')));
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    context.watch<ThemeState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final blue = isDark ? AppColors.darkSemanticBlue : AppColors.lightSemanticBlue;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    return Scaffold(
      body: Container(
        color: pageBg,
        child: SafeArea(
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
                AppPrimaryButton(
                  label: '新建用户',
                  onPressed: () => showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    builder: (_) => _AddUserSheet(
                      onSave: (name, role) async {
                        await _add(name, role);
                        if (mounted) Navigator.of(context).pop();
                      },
                    ),
                  ).then((_) {
                    if (mounted) _load();
                  }),
                ),
                const SizedBox(height: 8),
                if (_loading)
                  _hint('加载中…', ink400)
                else if (_users.isEmpty)
                  _hint('还没有其他用户', ink500)
                else
                  ..._users.map(
                    (u) => _UserTile(
                      user: u,
                      ink900: ink900,
                      ink500: ink500,
                      ink400: ink400,
                      blue: blue,
                      red: red,
                      onCycle: _cycleRole,
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

class _UserTile extends StatelessWidget {
  final AppUser user;
  final Color ink900;
  final Color ink500;
  final Color ink400;
  final Color blue;
  final Color red;
  final Future<void> Function(AppUser) onCycle;
  final Future<void> Function(AppUser) onRemove;

  const _UserTile({
    required this.user,
    required this.ink900,
    required this.ink500,
    required this.ink400,
    required this.blue,
    required this.red,
    required this.onCycle,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final isAdmin = user.role == 'admin';
    final deletable = !user.isSelf;

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
                          Text('我', style: TextStyle(color: ink400, fontSize: 13)),
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
                          style: TextStyle(color: Colors.white, fontSize: 12)),
                    )
                  else
                    Text('成员', style: TextStyle(color: ink500, fontSize: 12)),
                ],
              ),
              const SizedBox(height: 4),
              Text('加入 ${user.joinedDate}',
                  style: TextStyle(color: ink500, fontSize: 13)),
              const SizedBox(height: 8),
              Row(
                children: [
                  GestureDetector(
                    onTap: () => onCycle(user),
                    child: Text(isAdmin ? '降级' : '升级',
                        style: TextStyle(color: ink500, fontSize: 13)),
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
    final textOn = isDark ? AppColors.darkCtaText : Colors.white;
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
  final Future<void> Function(String name, String role) onSave;

  const _AddUserSheet({required this.onSave});

  @override
  State<_AddUserSheet> createState() => _AddUserSheetState();
}

class _AddUserSheetState extends State<_AddUserSheet> {
  final _name = TextEditingController();
  String _role = 'member';

  @override
  void dispose() {
    _name.dispose();
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
                    selected: _role == 'member',
                    onTap: () => setState(() => _role = 'member'),
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
              if (name.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('请填写用户名')),
                );
                return;
              }
              await widget.onSave(name, _role);
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
