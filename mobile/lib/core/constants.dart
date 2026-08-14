import 'package:flutter/foundation.dart';

/// 全局常量与配置。
///
/// 本地优先架构：页面与逻辑全部跑在安卓本地（本地 SQLite），
/// 只有"数据同步"走服务端。因此这里的 baseUrl 仅用于后台同步请求，
/// 不影响 App 本地使用。
class AppConfig {
  /// 调试模式下连接的服务端地址（仅 debug 构建生效）。
  /// 默认指向 Android 模拟器的宿主机回环（10.0.2.2 即运行模拟器的那台电脑）。
  /// 按你的调试方式只改这一处：
  ///   - iOS 模拟器：'http://localhost:3000'
  ///   - 真机同 WiFi：'http://<电脑局域网 IP>:3000'（例如 192.168.1.10:3000）
  static const String _debugApiBaseUrl = 'http://10.0.2.2:3000';

  /// 生产环境服务端地址（release / profile 构建生效）。
  static const String _releaseApiBaseUrl = 'https://jz.686295.xyz';

  /// 当前生效的 API 基地址：debug 连本地、release 连线上，构建时自动切换，无需手动改。
  static const String apiBaseUrl =
      kDebugMode ? _debugApiBaseUrl : _releaseApiBaseUrl;

  /// Ledger 四种类型。
  static const String kindWork = 'work';
  static const String kindTaoyuan = 'taoyuan';
  static const String kindGeneral = 'general';
  static const String kindTravel = 'travel';

  /// 软删除标记：本地库用 NULL 表示未删除。
  static const int notDeleted = 0;

  /// 应用版本号。CI 构建时会被 sed 注入真实 tag 值（见 flutter.yml）。
  /// 本地构建时就是这个 fallback 值，安装后 AppBar 副标题可见。
  static const String appVersion = '2.0.9+dev';

  /// 把图片地址解析成可直连的绝对 URL。
  ///
  /// 服务端把上传图片存为相对路径（如 `/api/uploads/xxx.jpg`，见网页端
  /// imageCleanup.ts），Flutter 的 [Image.network] 直接用相对路径会加载失败。
  /// 这里对以 `/` 开头的相对路径拼上 [apiBaseUrl]，已是 http(s) 绝对路径则原样返回。
  static String resolveImageUrl(String url) {
    if (url.startsWith('/')) return '$apiBaseUrl$url';
    return url;
  }
}
