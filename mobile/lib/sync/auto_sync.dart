import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/auth_state.dart';
import '../state/ledger_list_state.dart';
import 'connectivity.dart';

/// 离线优先架构的「自动补同步」入口。包在应用根部，透传 [child]。
///
/// 两个触发时机（此前完全缺失，导致离线记的账要等用户恰好进特定页面才推送）：
///  1. App 从后台切回前台（[AppLifecycleState.resumed]）——最常见：用户离线时后台
///     记账，回到前台已联网。
///  2. 网络从离线恢复（[NetworkMonitor.onOnline] 上升沿）——前台挂着时断网又重连。
///
/// 两者都只在「已登录」时触发，且走 [LedgerListState.sync]（内部 30s 节流，防抖）。
/// 重连时先 [LedgerListState.resetSync] 清节流，确保刚联网即把离线队列推上去。
class AutoSync extends StatefulWidget {
  final Widget child;
  const AutoSync({super.key, required this.child});

  @override
  State<AutoSync> createState() => _AutoSyncState();
}

class _AutoSyncState extends State<AutoSync> with WidgetsBindingObserver {
  StreamSubscription<void>? _onlineSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _onlineSub = NetworkMonitor.instance.onOnline.listen((_) {
      // 重连：清节流，立即补推离线队列 + 拉取。
      _trigger(resetThrottle: true);
    });
  }

  @override
  void dispose() {
    _onlineSub?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // 切前台：走节流同步，避免频繁切换前后台时反复全量拉取。
      _trigger(resetThrottle: false);
    }
  }

  Future<void> _trigger({required bool resetThrottle}) async {
    if (!mounted) return;
    final auth = context.read<AuthState>();
    if (!auth.authed) return; // 未登录不同步
    final ledgers = context.read<LedgerListState>();
    if (resetThrottle) ledgers.resetSync();
    try {
      await ledgers.sync();
    } catch (_) {
      // 自动补同步失败静默：不打扰用户，下次触发再试；手动刷新仍可看到错误。
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
