import 'dart:async';
import 'dart:io';
import 'package:connectivity_plus/connectivity_plus.dart' as cp;
import '../core/constants.dart';

/// 网络状态监测。
///
/// 两层能力：
///  1. [onOnline]：基于 connectivity_plus 的响应式流。设备从「无网络」切到「有网络」
///     的瞬间发一个事件——供 [AutoSync] 在重连后自动补推离线队列 + 拉取。
///  2. [isOnline]：DNS + /api/health 主动探活。响应式流只反映「有无网卡连接」，
///     不代表真的能连上服务端；真正发请求前用它兜底确认。
class NetworkMonitor {
  NetworkMonitor._internal();
  static final NetworkMonitor instance = NetworkMonitor._internal();

  final cp.Connectivity _cp = cp.Connectivity();

  /// 上一次已知是否「有网卡连接」。用于把 connectivity 流去抖成「离线→在线」的上升沿。
  bool? _lastHadLink;

  /// 「从离线切到在线」的上升沿事件流（去抖后）。
  ///
  /// connectivity_plus 会在任意网络变化时发事件（含 wifi↔蜂窝切换）；这里只在
  /// 由 none 变为「有连接」时 emit，避免频繁触发全量同步。
  /// （connectivity_plus 5.x 的 onConnectivityChanged 是单值 [cp.ConnectivityResult]。）
  Stream<void> get onOnline {
    return _cp.onConnectivityChanged.expand<void>((result) {
      final hadLink = result != cp.ConnectivityResult.none;
      final rose = (_lastHadLink == false) && hadLink;
      _lastHadLink = hadLink;
      return rose ? const [null] : const <void>[];
    });
  }

  /// 主动探活：先 DNS 解析主机名，通了再 HEAD /api/health。
  /// 探活失败（DNS 通但服务端异常）乐观认为在线，交由请求层暴露真实错误。
  Future<bool> isOnline() async {
    try {
      final host = Uri.parse(AppConfig.apiBaseUrl).host;
      final results =
          await InternetAddress.lookup(host).timeout(const Duration(seconds: 5));
      if (results.isEmpty) return false;

      final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
      try {
        final req = await client
            .headUrl(Uri.parse('${AppConfig.apiBaseUrl}/api/health'))
            .timeout(const Duration(seconds: 5));
        final resp = await req.close().timeout(const Duration(seconds: 5));
        return resp.statusCode < 500;
      } on TimeoutException {
        return false;
      } catch (_) {
        // DNS 通但探活失败：乐观在线，交由请求层判定
        return true;
      } finally {
        client.close(force: true);
      }
    } on SocketException {
      return false;
    } on TimeoutException {
      return false;
    } catch (_) {
      return false;
    }
  }
}
