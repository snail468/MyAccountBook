import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../state/auth_state.dart';
import '../../theme/design_tokens.dart';
import '../home_page.dart';
import '../login_page.dart';
import '../register_page.dart';
import '../../api/api_client.dart';
import '../../api/collaboration_api.dart';
import '../../data/models/ledger_member.dart';
import '../../state/ledger_list_state.dart';
import '../routes.dart';

/// 邀请接受落地页（1:1 对齐网页端 src/app/invite/[token]/page.tsx）。
///
/// 网页端按登录态分支：未登录跳注册/登录；已登录且已是成员 → 「进入账本」；
/// 已接受 / 无效 → 提示。本地优先无邀请后端，这里复刻同样的视觉状态机与文案：
/// 未登录时引导去注册/登录，已登录时给出「接受」动作（本地优先暂以账号为准）。
class InvitePage extends StatefulWidget {
  final String token;
  const InvitePage({super.key, required this.token});

  @override
  State<InvitePage> createState() => _InvitePageState();
}

class _InvitePageState extends State<InvitePage> {
  late final bool _authed;
  String _roleText = '成员';

  @override
  void initState() {
    super.initState();
    _authed = context.read<AuthState>().authed;
    if (_authed && !_invalid) _preview();
  }

  /// 接受前预览邀请角色（GET /api/invites/[token]），用于文案展示。
  Future<void> _preview() async {
    try {
      final p = await CollaborationApi(ApiClient.instance)
          .previewInvite(widget.token);
      if (!mounted) return;
      setState(() => _roleText = roleLabel(p.role));
    } catch (_) {
      // 忽略：保留默认文案
    }
  }

  /// 对齐网页端 token 长度校验（20–200）。
  bool get _invalid => widget.token.length < 20 || widget.token.length > 200;

  @override
  Widget build(BuildContext context) {
    if (_invalid) return _scaffold(_invalidView());
    if (!_authed) return _scaffold(_gateView());
    return _scaffold(_acceptView());
  }

  /// 居中 max-w-md 容器（对齐网页端 `mx-auto max-w-md px-6 pt-24 text-center`）。
  Widget _scaffold(Widget child) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    return Scaffold(
      backgroundColor: pageBg,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 96, 24, 24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 448),
              child: child,
            ),
          ),
        ),
      ),
    );
  }

  Widget _invalidView() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return Column(
      children: [
        Text('邀请链接无效',
            style: TextStyle(
                color: ink900, fontSize: 24, fontWeight: FontWeight.w600)),
        const SizedBox(height: 12),
        Text('链接可能已过期、已被撤回，或账本已被删除。',
            textAlign: TextAlign.center,
            style: TextStyle(color: ink500, fontSize: 14)),
        const SizedBox(height: 24),
        _textLink('回到首页', _goHome),
      ],
    );
  }

  /// 未登录：引导去注册 / 登录（对齐网页端未登录跳注册或登录的路径）。
  Widget _gateView() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final btnBg = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final btnText = isDark ? AppColors.lightInk900 : Colors.white;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;

    return Column(
      children: [
        const Text('✉️', style: TextStyle(fontSize: 48)),
        const SizedBox(height: 16),
        Text('你收到一份账本邀请',
            style: TextStyle(
                color: ink900, fontSize: 24, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Text('需要先注册或登录账号才能加入。',
            textAlign: TextAlign.center,
            style: TextStyle(color: ink500, fontSize: 14)),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: _goRegister,
            style: ElevatedButton.styleFrom(
              backgroundColor: btnBg,
              foregroundColor: btnText,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: const Text('注册',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: OutlinedButton(
            onPressed: _goLogin,
            style: OutlinedButton.styleFrom(
              backgroundColor: surface,
              foregroundColor: ink900,
              elevation: 0,
              side: BorderSide(color: border, width: 1),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: const Text('登录',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
          ),
        ),
      ],
    );
  }

  /// 已登录：邀请接受卡片（对齐网页端「你被邀请以 XX 身份加入这个账本」）。
  Widget _acceptView() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final btnBg = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final btnText = isDark ? AppColors.lightInk900 : Colors.white;

    return Column(
      children: [
        const Text('📒', style: TextStyle(fontSize: 48)),
        const SizedBox(height: 16),
        Text('账本邀请',
            style: TextStyle(
                color: ink900, fontSize: 24, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Text('你被邀请以 $_roleText 身份加入这个账本',
            textAlign: TextAlign.center,
            style: TextStyle(color: ink500, fontSize: 14)),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: _accept,
            style: ElevatedButton.styleFrom(
              backgroundColor: btnBg,
              foregroundColor: btnText,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: const Text('接受邀请',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
          ),
        ),
        const SizedBox(height: 16),
        _textLink('暂不加入', _goHome),
      ],
    );
  }

  Widget _textLink(String label, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Text(label,
            style: TextStyle(
              color: Theme.of(context).brightness == Brightness.dark
                  ? AppColors.darkInk500
                  : AppColors.lightInk500,
              fontSize: 14,
              decoration: TextDecoration.underline,
            )),
      );

  /// 真实接受邀请：POST /api/invites/[token] → 同步账本列表 → 跳转进账本。
  void _accept() async {
    try {
      final ledgerId = await CollaborationApi(ApiClient.instance)
          .acceptInvite(widget.token);
      await context.read<LedgerListState>().sync();
      final all = context.read<LedgerListState>().all;
      final l = all.firstWhere((x) => x.serverId == ledgerId,
          orElse: () => all.first);
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => pageForLedger(l)),
        (route) => false,
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('接受失败：$e')));
    }
  }

  void _goHome() => Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const HomePage()),
        (route) => false,
      );

  void _goLogin() => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => const LoginPage()));

  void _goRegister() => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => const RegisterPage()));
}
