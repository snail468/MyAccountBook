import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';

import '../core/exceptions.dart';
import 'api_client.dart';

/// 本地图片上传到服务端（复用网页端 `POST /api/events/upload`）。
///
/// 返回的 URL 是相对路径（如 `/api/uploads/<userId>/<yyyy-mm>/<hash>.<ext>`），
/// 显示时用 [AppConfig.resolveImageUrl] 解析成绝对地址。
class UploadApi {
  final ApiClient _client;
  UploadApi(this._client);

  /// 上传一张本地图片，成功返回服务端图片 URL；失败抛 [ApiException] 或 [NetworkException]。
  Future<String> uploadImage(XFile file) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(
        file.path,
        filename: file.name,
      ),
    });
    final data = await _client.post('/events/upload', form);
    if (data is Map && data['url'] is String) {
      return data['url'] as String;
    }
    throw ApiException('上传失败：服务端未返回图片地址');
  }
}
