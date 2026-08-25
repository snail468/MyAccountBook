import 'dart:io';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:path_provider/path_provider.dart';
import '../core/constants.dart';
import '../core/exceptions.dart';

/// 与服务端 Next.js API 通信的客户端。
///
/// 鉴权沿用网页版的 iron-session Cookie（名为 `mab_session`，httpOnly）。
/// 这里用 [PersistCookieJar] 把 Cookie 持久化到磁盘：登录后自动带回，
/// App 重启后依然有效，无需自己解析/存储 token。
class ApiClient {
  ApiClient._internal();

  static final ApiClient instance = ApiClient._internal();

  late final Dio dio;
  late final CookieJar cookieJar;
  bool _initialized = false;

  /// 必须在 runApp 前或首次使用前调用（需要异步拿存储目录）。
  Future<void> init() async {
    if (_initialized) return;
    final dir = await getApplicationSupportDirectory();
    final cookiePath = '${dir.path}/.cookies';
    await Directory(cookiePath).create(recursive: true);
    cookieJar = PersistCookieJar(storage: FileStorage(cookiePath));

    dio = Dio(BaseOptions(
      baseUrl: '${AppConfig.apiBaseUrl}/api',
      connectTimeout: const Duration(seconds: 15),
      // 接收超时放宽到 30s：全量拉取（多账本/大列表）和 serverless 冷启动首个
      // 请求容易超过 15s，收窄超时窗口是「小概率同步失败」的常见成因之一。
      receiveTimeout: const Duration(seconds: 30),
      contentType: Headers.jsonContentType,
      // 服务端 middleware.ts 对写操作（POST/PUT/PATCH/DELETE）校验 Origin
      // 头防 CSRF。浏览器自动带 Origin，但 Dio（原生 App）默认不带 →
      // 被判"跨站请求被拒绝"403。这里手动设成服务端地址，让中间件认为同源。
      headers: {
        'Origin': AppConfig.apiBaseUrl,
      },
    ));
    dio.interceptors.add(CookieManager(cookieJar));
    // 瞬时故障自动重试（指数退避 + 抖动）。放在错误规整之前：只重试「重试一次
    // 大概率就能成功」的瞬时故障——网络抖动/超时、网关 502/504、限流 429。
    // 所有写操作都幂等（POST 带 clientId，服务端按 (ledgerId, clientId) 去重；
    // PUT/PATCH/DELETE 天然幂等），因此重试任意方法都不会产生重复数据。
    dio.interceptors.add(_RetryInterceptor(dio));
    dio.interceptors.add(InterceptorsWrapper(
      onResponse: (resp, handler) => handler.next(resp),
      onError: (err, handler) {
        handler.next(_normalize(err));
      },
    ));
    _initialized = true;
  }

  DioException _normalize(DioException err) {
    if (err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.sendTimeout ||
        err.type == DioExceptionType.connectionError) {
      // 标记为网络层错误，调用方据此判断"离线"。
      return err.copyWith(error: NetworkException('网络不可用'));
    }
    return err;
  }

  /// 统一请求入口：非 2xx 转成 [ApiException]（或 [NetworkException]）。
  Future<dynamic> request(
    String method,
    String path, {
    dynamic data,
    Map<String, dynamic>? query,
  }) async {
    try {
      final resp = await dio.request<dynamic>(
        path,
        data: data,
        queryParameters: query,
        options: Options(method: method),
      );
      return resp.data;
    } on DioException catch (e) {
      final inner = e.error;
      if (inner is NetworkException) throw inner;
      final status = e.response?.statusCode;
      final body = e.response?.data;
      String msg = '请求失败';
      String? code;
      if (body is Map && body['error'] is String) {
        msg = body['error'] as String;
        code = body['code'] as String?;
      } else if (status == 401) {
        msg = '登录已失效，请重新登录';
        code = 'unauthorized';
      } else if (status == 429) {
        msg = '操作过于频繁，请稍后再试';
      } else if (status != null) {
        msg = '请求失败（$status）: $method $path';
        if (body is Map && body['error'] is String) {
          msg += ' - ${body['error']}';
        } else if (body is String && body.isNotEmpty && body.length < 200) {
          msg += ' - $body';
        }
      }
      throw ApiException(msg, code: code, statusCode: status);
    }
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      request('GET', path, query: query);
  Future<dynamic> post(String path, dynamic data) =>
      request('POST', path, data: data);
  Future<dynamic> put(String path, dynamic data) =>
      request('PUT', path, data: data);
  Future<dynamic> patch(String path, dynamic data) =>
      request('PATCH', path, data: data);
  Future<dynamic> delete(String path, {Map<String, dynamic>? query}) =>
      request('DELETE', path, query: query);

  /// 拉取原始文本响应（用于导出 CSV 等非 JSON 端点，如 GET /api/export）。
  Future<String> getText(String path) async {
    try {
      final resp = await dio.get<String>(
        path,
        options: Options(responseType: ResponseType.plain),
      );
      return resp.data ?? '';
    } on DioException catch (e) {
      final inner = e.error;
      if (inner is NetworkException) throw inner;
      final status = e.response?.statusCode;
      String msg = '请求失败';
      String? code;
      if (status == 401) {
        msg = '登录已失效，请重新登录';
        code = 'unauthorized';
      } else if (status != null) {
        msg = '请求失败（$status）: GET $path';
      }
      throw ApiException(msg, code: code, statusCode: status);
    }
  }

  /// 退出登录：清掉内存/磁盘里的会话 Cookie。
  Future<void> clearSession() async {
    await cookieJar.deleteAll();
  }

  /// 是否仍持有会话 Cookie（用于启动时的乐观判断）。
  Future<bool> hasSessionCookie() async {
    final cookies = await cookieJar.loadForRequest(
      Uri.parse(AppConfig.apiBaseUrl),
    );
    return cookies.any((c) => c.name == 'mab_session');
  }
}

/// 瞬时故障重试拦截器：指数退避 + 抖动，最多重试 [_maxRetries] 次。
///
/// 只重试「瞬时、且重试大概率成功」的错误：
///  - 网络层：连接/接收/发送超时、连接错误（信号抖动、切网、服务端冷启动超时）；
///  - 网关层：502 Bad Gateway / 504 Gateway Timeout（反代重启、瞬时不可用）；
///  - 限流：429 Too Many Requests（尊重 Retry-After，否则退避）。
///
/// 不重试 4xx 业务错误（400/401/403/404/409/422 等）——它们重试也不会变好，
/// 重试只会拖慢失败反馈。5xx 里只挑网关族（502/504），不碰 500（多为服务端真实
/// bug，重试无益）和 503——本 App 里 503 专指服务端未配置 CARD_SECRET 的确定性
/// 失败（见 SyncService._pullCards 已优雅跳过），重试只会平白拖慢每次同步。
/// serverless 冷启动通常表现为超时（已在网络层重试），而非 503。
///
/// 安全性：本 App 所有写操作都幂等，重试不会重复建单：
///  - POST 携带 clientId，服务端按 (ledgerId, clientId) 唯一键去重，返回既有 id；
///  - PUT/PATCH/DELETE 语义幂等。
class _RetryInterceptor extends Interceptor {
  _RetryInterceptor(this._dio);

  final Dio _dio;

  static const int _maxRetries = 3;
  static const String _attemptKey = 'retry_attempt';

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final attempt = (err.requestOptions.extra[_attemptKey] as int?) ?? 0;

    if (!_isRetryable(err) || attempt >= _maxRetries) {
      handler.next(err);
      return;
    }

    await Future<void>.delayed(_backoff(attempt, err));

    // 透传 Cookie/超时等原始配置，仅递增重试计数，重新发起同一请求。
    final options = err.requestOptions;
    options.extra = {...options.extra, _attemptKey: attempt + 1};
    try {
      final resp = await _dio.fetch<dynamic>(options);
      handler.resolve(resp);
    } on DioException catch (e) {
      // 交回错误链：若仍可重试，会再次进入本拦截器；否则由后续拦截器规整。
      handler.next(e);
    }
  }

  bool _isRetryable(DioException err) {
    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.connectionError:
        return true;
      default:
        break;
    }
    final status = err.response?.statusCode;
    return status == 429 || status == 502 || status == 504;
  }

  Duration _backoff(int attempt, DioException err) {
    // 429 优先尊重服务端 Retry-After（秒），上限 30s，避免异常大的等待。
    final ra = err.response?.headers.value('retry-after');
    if (ra != null) {
      final secs = int.tryParse(ra.trim());
      if (secs != null && secs > 0 && secs <= 30) {
        return Duration(seconds: secs);
      }
    }
    // 指数退避：约 0.4s → 0.9s → 1.8s，叠加 0~300ms 抖动，错开并发重试的峰值。
    final base = 300 * (1 << attempt); // 300, 600, 1200 ms
    final jitter = Random().nextInt(300);
    return Duration(milliseconds: base + jitter);
  }
}
