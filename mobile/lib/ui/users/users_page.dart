import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';
import 'users_state.dart';

/// 用户管理页（设计 2:137）。
class UsersPage extends StatelessWidget {
  const UsersPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => UsersState()..load(),
      child: Scaffold(
        backgroundColor: AppTheme.scaffoldBackground(context),
        body: const _Body(),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<UsersState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final blue = AppColors.lightSemanticBlue;
    final red = AppColors.lightSemanticRed;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 48, 16, 24),
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
              builder: (_) => ChangeNotifierProvider.value(
                value: state,
                child: const AddUserSheet(),
              ),
            ),
          ),
          const SizedBox(height: 8),

          SectionLabel('用户'),
          if (state.users.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('还没有其他用户',
                  style: TextStyle(color: ink500, fontSize: 13)),
            )
          else
            ...state.users.map((u) =>
                _UserTile(user: u, red: red, blue: blue)),
        ],
      ),
    );
  }
}

class _UserTile extends StatelessWidget {
  final AppUser user;
  final Color red;
  final Color blue;

  const _UserTile({
    required this.user,
    required this.red,
    required this.blue,
  });

  @override
  Widget build(BuildContext context) {
    final state = context.watch<UsersState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
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
                        if (user.isSelf)
                          const SizedBox(width: 8),
                        if (user.isSelf)
                          Text('我',
                              style: TextStyle(color: ink400, fontSize: 13)),
                      ],
                    ),
                  ),
                  // 角色徽章
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
                    Text('成员',
                        style: TextStyle(color: ink500, fontSize: 12)),
                ],
              ),
              const SizedBox(height: 4),
              Text('加入 ${user.joinedDate}',
                  style: TextStyle(color: ink500, fontSize: 13)),
              const SizedBox(height: 8),
              Row(
                children: [
                  GestureDetector(
                    onTap: () {
                      state.resetPassword(user);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('已发送重置密码邮件（演示）')),
                      );
                    },
                    child: Text('重置密码',
                        style: TextStyle(color: ink500, fontSize: 13)),
                  ),
                  const SizedBox(width: 16),
                  GestureDetector(
                    onTap: () => state.cycleRole(user),
                    child: Text(isAdmin ? '降级' : '升级',
                        style: TextStyle(color: ink500, fontSize: 13)),
                  ),
                  const SizedBox(width: 16),
                  GestureDetector(
                    onTap: deletable ? () => state.remove(user) : null,
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

/// 新建用户弹层（用户名 / 密码）。
class AddUserSheet extends StatefulWidget {
  const AddUserSheet({super.key});

  @override
  State<AddUserSheet> createState() => _AddUserSheetState();
}

class _AddUserSheetState extends State<AddUserSheet> {
  final _name = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _password.dispose();
    super.dispose();
  }

  void _save() {
    final name = _name.text.trim();
    final password = _password.text;
    if (name.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请填写用户名与密码')),
      );
      return;
    }
    context.read<UsersState>().add(name, password);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
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
          AppTextField(hint: '密码', obscure: true, controller: _password),
          const SizedBox(height: 16),
          AppPrimaryButton(label: '保存', onPressed: _save),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
