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
/// 居中卡片：品牌 Logo + 应用名「心愿便利贴」→ 用户名 / 密码输入框 →
/// 「记住登录信息」勾选 → 主按钮 → 注册入口。保留现有登录流程：
/// catch 到错误显示「用户名或密码错误」。
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
  bool _remember = false;

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthState>();
    final remUser = auth.rememberedUsername;
    if (remUser != null && remUser.isNotEmpty) {
      _user.text = remUser;
      // 若曾记住凭据，默认勾选「记住登录信息」，省去再次勾选。
      _remember = true;
    }
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    _error = null;
    final user = _user.text.trim();
    final pass = _pass.text;
    try {
      await context.read<AuthState>().login(user, pass);
      // 登录成功后按勾选状态保存 / 清除记住的凭据。
      final auth = context.read<AuthState>();
      if (_remember) {
        await auth.saveRememberMe(user, pass);
      } else {
        await auth.clearRememberPassword();
      }
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
    // 品牌粉：Logo 圆底填充（浅色下用 8% 透明度，避免抢眼）。
    final brand = isDark ? AppColors.darkBrandPink : AppColors.lightBrandPink;
    final red = AppColors.lightSemanticRed;

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ---- 品牌区：Logo + 应用名 ----
              Column(
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: brand.withOpacity(0.08),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.account_balance_wallet,
                      size: 32,
                      color: brand,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text('心愿便利贴',
                      style: TextStyle(
                          color: ink900, fontSize: 24, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Text('登录以同步你的多账本',
                      style: TextStyle(color: ink500, fontSize: 13)),
                ],
              ),
              const SizedBox(height: 32),

              // ---- 输入区 ----
              AppTextField(hint: '用户名', controller: _user),
              const SizedBox(height: 12),
              AppTextField(hint: '密码', obscure: true, controller: _pass),
              const SizedBox(height: 8),

              // ---- 记住登录信息 ----
              Row(
                children: [
                  SizedBox(
                    height: 24,
                    width: 24,
                    child: Checkbox(
                      value: _remember,
                      onChanged: (v) => setState(() => _remember = v ?? false),
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () => setState(() => _remember = !_remember),
                    child: Text('记住登录信息',
                        style: TextStyle(color: ink500, fontSize: 13)),
                  ),
                ],
              ),
              const SizedBox(height: 8),

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
