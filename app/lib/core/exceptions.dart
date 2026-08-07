/// API / 业务异常的统一定义。
///
/// 后端统一错误体为 { error: string, code: string }（见 src/lib/apiError.ts），
/// 这里对应解析成 ApiException，UI 直接展示 [message]。
class ApiException implements Exception {
  final String message;
  final String? code;
  final int? statusCode;

  ApiException(this.message, {this.code, this.statusCode});

  @override
  String toString() => 'ApiException($statusCode, $code): $message';
}

/// 网络不可达（用于离线判断）。
class NetworkException implements Exception {
  final String message;
  NetworkException([this.message = '网络不可用，已存入离线队列']);
  @override
  String toString() => 'NetworkException: $message';
}
