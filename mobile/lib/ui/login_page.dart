import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/design_tokens.dart';
import 'register_page.dart';
import 'widgets/app_text_field.dart';
import 'widgets/app_primary_button.dart';

/// 登录页（设计 2:76 重做）。
///
/// 背景 pageBg，标题「登录」ink900。保留现有登录流程：catch 到错误显示「用户名或密码错误」。
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _user = TextEditingController();
  final _pass = TextEditingController();
  String? _error;
  bool _busy = false;

  Future<void> _submit() async {
    setState(() => _busy = true);
    _error = null;
    try {
      await context.read<AuthState>().login(_user.text.trim(), _pass.text);
      // 登录成功后 RootSwitcher 会自动切到首页，首页负责首次同步
    } catch (_) {
      setState(() => _error = '用户名或密码错误');
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
    final red = isDark ? AppColors.darkCtaText : AppColors.lightSemanticRed;

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('登录',
                  style: TextStyle(
                      color: ink900, fontSize: 28, fontWeight: FontWeight.w700)),
              const SizedBox(height: 24),
              AppTextField(hint: '用户名', controller: _user),
              const SizedBox(height: 12),
              AppTextField(hint: '密码', obscure: true, controller: _pass),
              const SizedBox(height: 16),
              if (_error != null) ...[
                Text(_error!,
                    style: TextStyle(color: red, fontSize: 13)),
                const SizedBox(height: 8),
              ],
              AppPrimaryButton(
                label: _busy ? '登录中…' : '登录',
                onPressed: _busy ? null : _submit,
              ),
              const SizedBox(height: 12),
              Center(
                child: TextButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const RegisterPage()),
                  ),
                  child: Text('还没有账号？ 注册',
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
