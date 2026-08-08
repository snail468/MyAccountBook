/// 全局常量与配置。
///
/// 本地优先架构：页面与逻辑全部跑在安卓本地（本地 SQLite），
/// 只有"数据同步"走服务端。因此这里的 baseUrl 仅用于后台同步请求，
/// 不影响 App 本地使用。
class AppConfig {
  /// 服务端 API 基地址。部署在哪就填哪（与 PWA 同域，/api 由 Next.js 提供）。
  /// 与网页版 TWA_HOST 保持一致即可。
  static const String apiBaseUrl = 'https://jz.686295.xyz';

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
}
