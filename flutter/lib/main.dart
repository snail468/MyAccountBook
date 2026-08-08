import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'api/api_client.dart';
import 'core/constants.dart';
import 'state/auth_state.dart';
import 'state/ledger_list_state.dart';
import 'ui/login_page.dart';
import 'ui/home_page.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiClient.instance.init();
  final auth = AuthState();
  await auth.init();
  runApp(MyApp(auth: auth));
}

class MyApp extends StatelessWidget {
  final AuthState auth;
  const MyApp({super.key, required this.auth});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider(create: (_) => LedgerListState()),
      ],
      child: MaterialApp(
        title: '心愿便利贴',
        theme: ThemeData(
          colorSchemeSeed: Colors.teal,
          useMaterial3: true,
        ),
        home: const RootSwitcher(),
      ),
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
