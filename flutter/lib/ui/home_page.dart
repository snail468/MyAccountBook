import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/constants.dart';
import '../core/money.dart';
import '../data/models/ledger.dart';
import '../state/auth_state.dart';
import '../state/ledger_list_state.dart';
import 'routes.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final s = context.read<LedgerListState>();
      await s.load();
      try {
        await s.sync();
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('同步失败，请查看下方错误')),
          );
        }
      }
    });
  }

  static const _sections = [
    (AppConfig.kindGeneral, '普通账本', Icons.wallet),
    (AppConfig.kindWork, '工作账本', Icons.work),
    (AppConfig.kindTaoyuan, '桃源', Icons.auto_awesome),
    (AppConfig.kindTravel, '旅游', Icons.flight),
  ];

  @override
  Widget build(BuildContext context) {
    final state = context.watch<LedgerListState>();
    final auth = context.watch<AuthState>();
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('心愿便利贴',
                style: TextStyle(fontSize: 18)),
            Text('${auth.username ?? ''} · v${AppConfig.appVersion}',
                style: const TextStyle(fontSize: 12)),
          ],
        ),
        actions: [
          IconButton(
            tooltip: '同步',
            icon: state.syncing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
            onPressed: state.syncing
                ? null
                : () async {
                    try {
                      await state.sync();
                    } catch (_) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('同步失败，请查看下方错误')),
                        );
                      }
                    }
                  },
          ),
          PopupMenuButton<String>(
            onSelected: (v) async {
              if (v == 'logout') {
                await context.read<AuthState>().logout();
              }
            },
            itemBuilder: (_) =>
                const [PopupMenuItem(value: 'logout', child: Text('退出登录'))],
          ),
        ],
      ),
      body: state.all.isEmpty && state.error == null
          ? const Center(child: Padding(
              padding: EdgeInsets.all(32),
              child: Text('还没有账本，去网页端创建吧'),
            ))
          : ListView(
              children: [
                if (state.error != null)
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: Text(state.error!,
                        style: const TextStyle(color: Colors.orange)),
                  ),
                ..._sections.expand((sec) {
                  final list = state.byKind(sec.$1);
                  if (list.isEmpty) return <Widget>[];
                  return [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                      child: Text(sec.$2,
                          style: Theme.of(context).textTheme.titleMedium),
                    ),
                    ...list.map((l) => _ledgerTile(context, l, sec.$3)),
                  ];
                }),
              ],
            ),
    );
  }

  Widget _ledgerTile(BuildContext context, Ledger l, IconData icon) {
    return ListTile(
      leading: CircleAvatar(child: Icon(icon)),
      title: Text(l.name),
      subtitle: l.budgetCents != null
          ? Text('月预算 ${Money.formatCents(l.budgetCents!)}')
          : null,
      trailing: const Icon(Icons.chevron_right),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => pageForLedger(l)),
      ),
    );
  }
}
