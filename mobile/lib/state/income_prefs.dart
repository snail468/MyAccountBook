import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';
import '../api/user_prefs_api.dart';

/// 「总收入 A 的组成」开关的本地 + 服务端同步。
///
/// 键名与 [IncomeComponentsCard] 原本地键保持一致（`incomeComponentOverrides`），
/// 避免历史本地数据失效。服务端以 [UserPrefsApi] 读写 [User.preferences]，
/// 使新设备登录后自动继承用户配置，无需重新设置 [#5]。
const String kIncomeComponentOverrides = 'incomeComponentOverrides';

/// 读取本地开关表（空表表示未覆盖、按各分量默认）。
Future<Map<String, bool>> readIncomeOverrides() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(kIncomeComponentOverrides);
    if (raw == null || raw.isEmpty) return {};
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    return decoded.map((k, v) => MapEntry(k, v is bool ? v : v == true));
  } catch (_) {
    return {};
  }
}

/// 写入本地开关表。
Future<void> writeIncomeOverrides(Map<String, bool> map) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(kIncomeComponentOverrides, jsonEncode(map));
  } catch (_) {
    // 忽略写入失败
  }
}

/// 登录后从服务端拉取并写入本地：新设备自动继承用户的总收入组成配置 [#5]。
Future<void> fetchIncomeOverridesFromServer() async {
  try {
    final remote = await UserPrefsApi(ApiClient.instance).getIncomeComponents();
    if (remote.isNotEmpty) await writeIncomeOverrides(remote);
  } catch (_) {
    // 离线/失败：保留本地现有配置
  }
}

/// 保存时回写服务端（浅合并由服务端负责）；本地也落盘一份。
Future<void> pushIncomeOverridesToServer(Map<String, bool> map) async {
  await writeIncomeOverrides(map);
  try {
    await UserPrefsApi(ApiClient.instance).saveIncomeComponents(map);
  } catch (_) {
    // 离线：本地已存，下次联网同步再补
  }
}
