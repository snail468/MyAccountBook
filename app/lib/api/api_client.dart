import 'dart:io';
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
      receiveTimeout: const Duration(seconds: 15),
      contentType: Headers.jsonContentType,
    ));
    dio.interceptors.add(CookieManager(cookieJar));
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
        msg = '请求失败（${status}）';
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
