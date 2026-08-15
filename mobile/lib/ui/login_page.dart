import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/auth_state.dart';
import '../state/ledger_list_state.dart';
import '../sync/sync_service.dart';
import '../theme/app_theme.dart';
import '../theme/design_tokens.dart';
import 'register_page.dart';
import 'widgets/app_text_field.dart';

/// 登录页（1:1 对齐网页端 src/app/login/page.tsx）。
///
/// 网页端是**顶部左对齐**的极简布局：标题「登录」(text-3xl=30px / semibold)
/// + 用户名/密码输入框(rounded-2xl + 1px border) + 错误提示 + 中性主按钮
/// (bg-ink-900/dark:bg-ink-100，登录中显示 spinner) + 「还没有账号？ 注册」链接。
/// 网页端是浏览器会话模型，**没有「记住登录信息」勾选**（Flutter 本地优先的
/// 记住凭据能力不在网页 UI 内），故严格 1:1 不渲染该勾选；仅预填记住的用户名。
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

  @override
  void initState() {
    super.initState();
    // 预填记住的用户名（仅用户名，不自动登录；与网页端无此 UI 但不冲突）。
    final remUser = context.read<AuthState>().rememberedUsername;
    if (remUser != null && remUser.isNotEmpty) _user.text = remUser;
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final user = _user.text.trim();
    final pass = _pass.text;
    try {
      final auth = context.read<AuthState>();
      await auth.login(user, pass);
      // 切换到不同用户：清空上一用户本地数据 + 重置账本缓存，避免旧数据串号 [#2]
      if (auth.consumeUserSwitch()) {
        await SyncService.instance.wipeLocalData();
        if (mounted) context.read<LedgerListState>().resetCache();
      }
      // 登录成功后由 RootSwitcher 据 authed 切到首页，首页负责首次同步。
    } catch (_) {
      if (mounted) setState(() => _error = '用户名或密码错误');
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
    // 中性主按钮：浅色=ink-900 深底；深色=ink-100 浅底，文字反之。
    final btnBg = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final btnText = isDark ? AppColors.lightInk900 : Colors.white;

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 64, 24, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _BrandMark(),
            const SizedBox(height: 16),
            Text('心愿便利贴',
                style: TextStyle(
                    color: ink900, fontSize: 24, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('记账 · 协同 · 一目了然',
                style: TextStyle(color: ink500, fontSize: 13)),
            const SizedBox(height: 28),
            Text('登录',
                style: TextStyle(
                    color: ink900, fontSize: 30, fontWeight: FontWeight.w600)),
            const SizedBox(height: 32),
            AppTextField(
              hint: '用户名',
              controller: _user,
            ),
            const SizedBox(height: 16),
            AppTextField(
              hint: '密码',
              obscure: true,
              controller: _pass,
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, style: TextStyle(color: red, fontSize: 14)),
            ],
            const SizedBox(height: 16),
            // 对齐网页端 `disabled:opacity-60`：忙碌（禁用）时整按钮降到 0.6 透明度。
            Opacity(
              opacity: _busy ? 0.6 : 1.0,
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
                child: _busy
                    ? Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: btnText,
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Text('登录中…',
                              style: TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.w500)),
                        ],
                      )
                    : const Text('登录',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w500)),
              ),
            ),
            ),
            const SizedBox(height: 24),
            Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('还没有账号？ ',
                      style: TextStyle(color: ink500, fontSize: 14)),
                  GestureDetector(
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const RegisterPage()),
                    ),
                    child: Text('注册',
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

/// 应用品牌标识：app 图标同源 `logo.png`（512×512，与 launcher icon `icon-192`
/// 同图）。登录页只用图标，舍弃下方「心愿便利贴+tagline」文字长条 [#4]。
class _BrandMark extends StatelessWidget {
  const _BrandMark();
  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: Image.asset(
        'assets/logo.png',
        width: 120,
        height: 120,
        fit: BoxFit.cover,
      ),
    );
  }
}
