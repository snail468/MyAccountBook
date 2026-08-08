import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'api/api_client.dart';
import 'core/constants.dart';
import 'state/auth_state.dart';
import 'state/ledger_list_state.dart';
import 'state/theme_state.dart';
import 'theme/app_theme.dart';
import 'ui/login_page.dart';
import 'ui/home_page.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiClient.instance.init();

  // 先加载主题状态（持久化），再构建 UI，确保首帧即应用正确主题
  final themeState = ThemeState();
  await themeState.load();

  final auth = AuthState();
  await auth.init();

  runApp(MyApp(auth: auth, themeState: themeState));
}

class MyApp extends StatelessWidget {
  final AuthState auth;
  final ThemeState themeState;
  const MyApp({super.key, required this.auth, required this.themeState});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider.value(value: themeState),
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
    return MaterialApp(
      title: '心愿便利贴',
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeState.themeMode.toThemeMode(),
      builder: (context, child) {
        return MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(themeState.fontScale)),
          child: child!,
        );
      },
      home: const RootSwitcher(),
    );
  }
}

/// 根据登录态在登录页 / 首页间切换。
class RootSwitcher extends StatelessWidget {
  const RootSwitcher({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    if (!auth.initialized) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    if (auth.authed) return const HomePage();
    return const LoginPage();
  }
}
