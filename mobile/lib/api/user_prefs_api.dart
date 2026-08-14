import 'api_client.dart';

/// 用户偏好接口（对齐网页端 /api/user/preferences）。
///
/// 目前只有 incomeComponents 一个字段：各「总收入 A」分量的启用开关。
/// 服务端做浅合并，移动端只需传关心的键，未传的保留原值 [#5]。
class UserPrefsApi {
  final ApiClient _client;

  UserPrefsApi(this._client);

  /// 拉取 incomeComponents 开关表（键=分量 key，值=是否计入 A）。
  /// 服务端无该字段时返回空表，调用方按「本地优先」回退。
  Future<Map<String, bool>> getIncomeComponents() async {
    final data = await _client.get('/user/preferences');
    final map = <String, bool>{};
    if (data is Map) {
      // 服务端约定：{ ok:true, preferences: { incomeComponents: {...} } }
      final prefs = data['preferences'];
      final ic =
          (prefs is Map ? prefs['incomeComponents'] : null) ?? data['incomeComponents'];
      if (ic is Map) {
        for (final e in ic.entries) {
          map[e.key.toString()] = e.value == true;
        }
      }
    }
    return map;
  }

  /// 保存 incomeComponents 开关表（浅合并由服务端负责）。
  Future<void> saveIncomeComponents(Map<String, bool> map) async {
    await _client.patch('/user/preferences', {'incomeComponents': map});
  }
}
