import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/design_tokens.dart';
import 'widgets/app_text_field.dart';
import 'widgets/app_primary_button.dart';

/// 注册页（设计 2:138）：完全对齐 [LoginPage] 结构。
class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});
  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _user = TextEditingController();
  final _pass = TextEditingController();
  String? _error;
  bool _busy = false;

  Future<void> _submit() async {
    setState(() => _busy = true);
    _error = null;
    try {
      await context.read<AuthState>().register(
            _user.text.trim(),
            _pass.text,
          );
      // 成功后让 RootSwitcher 自动切到首页（与登录行为一致），不 pop
    } catch (_) {
      setState(() => _error = '注册失败，请检查网络或用户名');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _user.dispose();
    _pass.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    // 错误文案用语义红（暗色下仍清晰，不套 isDark 分支）。
    final red = AppColors.lightSemanticRed;

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('创建账号',
                  style: TextStyle(
                      color: ink900, fontSize: 28, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              Text('记录每一笔，理清生活的账',
                  style: TextStyle(color: ink500, fontSize: 13)),
              const SizedBox(height: 24),
              AppTextField(hint: '用户名', controller: _user),
              const SizedBox(height: 12),
              AppTextField(hint: '密码', obscure: true, controller: _pass),
              const SizedBox(height: 16),
              if (_error != null) ...[
                Text(_error!, style: TextStyle(color: red, fontSize: 13)),
                const SizedBox(height: 8),
              ],
              AppPrimaryButton(
                label: _busy ? '注册中…' : '注册',
                onPressed: _busy ? null : _submit,
              ),
              const SizedBox(height: 12),
              Center(
                child: TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text('已有账号？ 登录',
                      style: TextStyle(color: ink500, fontSize: 13)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
