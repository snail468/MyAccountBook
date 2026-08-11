import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/design_tokens.dart';
import 'widgets/app_text_field.dart';

/// 注册页（1:1 对齐网页端 src/app/register/page.tsx + RegisterForm.tsx）。
///
/// 网页端「首次注册」（bootstrap）路径：顶部左对齐，标题「首次注册」(30px/w600)
/// + 说明（用户名 2-32、密码至少 6 位）+ 用户名/密码输入框 + 错误提示 +
/// 中性主按钮（无 spinner，disabled:opacity-50）+ 「已有账号？ 登录」链接。
/// 网页端的邀请/注册关闭/链接无效等分支是服务端逻辑，本地优先单用户场景
/// 走 bootstrap 路径即可，故不渲染这些分支。
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
    setState(() {
      _busy = true;
      _error = null;
    });
    final user = _user.text.trim();
    final pass = _pass.text;
    // 对齐网页端 input 约束：用户名 2-32，密码至少 6 位（原生 minLength/maxLength）。
    if (user.length < 2 || user.length > 32) {
      if (mounted) setState(() {
        _busy = false;
        _error = '用户名需 2-32 个字符';
      });
      return;
    }
    if (pass.length < 6) {
      if (mounted) setState(() {
        _busy = false;
        _error = '密码至少 6 位';
      });
      return;
    }
    try {
      await context.read<AuthState>().register(user, pass);
      // 成功后由 RootSwitcher 据 authed 切到首页。
    } catch (_) {
      if (mounted) setState(() => _error = '注册失败，请检查网络或用户名');
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
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final btnBg = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final btnText = isDark ? AppColors.lightInk900 : Colors.white;

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 64, 24, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('首次注册',
                style: TextStyle(
                    color: ink900, fontSize: 30, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text('这是系统里的第一个账号，将自动成为管理员。用户名 2-32 字符，密码至少 6 位。',
                style: TextStyle(color: ink500, fontSize: 14)),
            const SizedBox(height: 32),
            AppTextField(hint: '用户名', controller: _user),
            const SizedBox(height: 16),
            AppTextField(hint: '密码', obscure: true, controller: _pass),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, style: TextStyle(color: red, fontSize: 14)),
            ],
            const SizedBox(height: 16),
            // 对齐网页端 `disabled:opacity-50`：忙碌（禁用）时整按钮降到 0.5 透明度。
            Opacity(
              opacity: _busy ? 0.5 : 1.0,
              child: SizedBox(
                height: 52,
                child: ElevatedButton(
                  onPressed: _busy ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: btnBg,
                    disabledBackgroundColor: btnBg,
                    foregroundColor: btnText,
                    disabledForegroundColor: btnText,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: Text(_busy ? '注册中…' : '注册',
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w500)),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('已有账号？ ',
                      style: TextStyle(color: ink500, fontSize: 14)),
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Text('登录',
                        style: TextStyle(
                            color: ink900,
                            fontSize: 14,
                            decoration: TextDecoration.underline)),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
