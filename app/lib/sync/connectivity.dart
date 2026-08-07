import 'dart:async';
import 'dart:io';
import '../core/constants.dart';

/// 联网探测。Android 上可用 [dart:io]。
///
/// 先 DNS 解析主机名；解析通再探一次 HTTP（/api/health），探活失败也乐观认为在线
/// —— 真正的网络错误会在 [ApiClient] 请求层以 [NetworkException] 暴露。
class Connectivity {
  Connectivity._internal();
  static final Connectivity instance = Connectivity._internal();

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
