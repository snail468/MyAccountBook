import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dart:ui';
import 'api/api_client.dart';
import 'core/constants.dart';
import 'state/auth_state.dart';
import 'state/ledger_list_state.dart';
import 'state/theme_state.dart';
import 'state/security_state.dart';
import 'theme/app_theme.dart';
import 'theme/design_tokens.dart';
import 'ui/login_page.dart';
import 'ui/home_page.dart';
import 'ui/app_routes.dart';
import 'ui/widgets/click_fx.dart';
import 'security/bio_gate.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiClient.instance.init();

  // 先加载主题状态（持久化），再构建 UI，确保首帧即应用正确主题
  final themeState = ThemeState();
  await themeState.load();

  final auth = AuthState();
  await auth.init();

  final security = SecurityState();
  await security.init();

  runApp(MyApp(auth: auth, themeState: themeState, security: security));
}

class MyApp extends StatelessWidget {
  final AuthState auth;
  final ThemeState themeState;
  final SecurityState security;
  const MyApp(
      {super.key,
      required this.auth,
      required this.themeState,
      required this.security});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider.value(value: themeState),
        ChangeNotifierProvider.value(value: security),
        ChangeNotifierProvider(create: (_) => LedgerListState()),
      ],
      child: const AppRoot(),
    );
  }
}

/// 位于 [MultiProvider] 之下，可监听 [ThemeState] 实现主题/字号实时切换。
class AppRoot extends StatelessWidget {
  const AppRoot({super.key});

  @override
  Widget build(BuildContext context) {
    final themeState = context.watch<ThemeState>();
    // 全局点击光效/音效层：包在 MaterialApp 之外，按 ThemeState 开关决策 [#4]
    return ClickFxLayer(
      child: MaterialApp(
        title: '心愿便利贴',
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: themeState.themeMode.toThemeMode(),
      builder: (context, child) {
        return MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(themeState.fontScale)),
          // 防御性修复 [#4]：再包一层 DefaultTextStyle，确保没有任何继承路径能给文字加下划线。
          // 显式设置 TextDecoration.underline 的链接文本不受影响。
          child: DefaultTextStyle.merge(
            style: const TextStyle(decoration: TextDecoration.none),
            child: _GlassFrame(child: child!),
          ),
        );
      },
      home: const RootSwitcher(),
      onGenerateRoute: appOnGenerateRoute,
      navigatorObservers: [ClickFxRouteObserver()],
      ),
    );
  }
}

/// 玻璃主题全局桌布：当 [ThemeState.style] 为玻璃时，在路由之下绘制与网页端
/// globals.css `.liquid` / `.liquid.dark` 一致的四角径向渐变 + 兜底底色；否则原样
/// 透传子组件（经典主题由各 Scaffold 不透明底色覆盖）。
///
/// 配合 [AppTheme.scaffoldBackground] 在玻璃态返回透明，使渐变透出；配合
/// [AppCard] / [AppFloatingButton] 的半透明 + `BackdropFilter` 形成磨砂玻璃观感。
class _GlassFrame extends StatelessWidget {
  final Widget child;
  const _GlassFrame({required this.child});

  @override
  Widget build(BuildContext context) {
    final themeState = context.watch<ThemeState>();
    if (themeState.style != AppStyle.glass) return child;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Stack(
      children: [
        Positioned.fill(child: _GlassBackdrop(isDark: isDark)),
        Positioned.fill(child: child),
      ],
    );
  }
}

/// 四角径向渐变桌布（对齐 globals.css .liquid 的 radial-gradient 堆叠）。
class _GlassBackdrop extends StatelessWidget {
  final bool isDark;
  const _GlassBackdrop({required this.isDark});

  @override
  Widget build(BuildContext context) {
    final base = isDark ? AppColors.darkGlassPageBg : AppColors.glassPageBg;
    final blobs = isDark
        ? const [
            _Radial(color: Color(0xA6783C82), x: 0.12, y: 0.12),
            _Radial(color: Color(0xA6325AA0), x: 0.88, y: 0.18),
            _Radial(color: Color(0xA65A3C8C), x: 0.30, y: 0.92),
            _Radial(color: Color(0x8C8C3C5A), x: 0.82, y: 0.88),
          ]
        : const [
            _Radial(color: Color(0x8CFF9BC8), x: 0.12, y: 0.12),
            _Radial(color: Color(0x8C9BBEFF), x: 0.88, y: 0.18),
            _Radial(color: Color(0x8CC8A2D8), x: 0.30, y: 0.92),
            _Radial(color: Color(0x8CFFD2A0), x: 0.82, y: 0.88),
          ];
    return Container(
      color: base,
      child: Stack(
        children: [
          for (final b in blobs)
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment(b.x * 2 - 1, b.y * 2 - 1),
                    radius: 1.0,
                    colors: [b.color, b.color.withOpacity(0.0)],
                    stops: const [0.0, 0.6],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Radial {
  final Color color;
  final double x;
  final double y;
  const _Radial({required this.color, required this.x, required this.y});
}

/// 根据登录态在登录页 / 首页间切换。
class RootSwitcher extends StatelessWidget {
  const RootSwitcher({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final sec = context.watch<SecurityState>();
    if (!auth.initialized) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    if (!auth.authed) return const LoginPage();
    if (sec.mode == BioLockMode.global) {
      return BioGate(
        reason: '验证指纹/面容以解锁应用',
        relockOnResume: true,
        child: const HomePage(),
      );
    }
    return const HomePage();
  }
}
