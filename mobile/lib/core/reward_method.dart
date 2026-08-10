import 'dart:convert';

/// 桃源奖励计量方式（对齐网页端 src/lib/rewardMethod.ts）。
///
/// 不是所有奖励都能用金额表示：
///   money  现金 / 京东卡 / 未知 key —— 有明确面值，参与金额合计
///   count  Q币 / 萝卜币 —— 按「个」发，个数不是钱，绝不能加进收入
///   text   周边 / 自定义 —— 没有数量概念，只有「是什么」
class RewardValueKind {
  static const String money = 'money';
  static const String count = 'count';
  static const String text = 'text';
}

/// 该方式的计量种类。未知 key 兜底成 money（与网页端一致，防漏算）。
String rewardValueKind(String? method) {
  if (method == null || method.isEmpty) return RewardValueKind.money;
  if (method.startsWith('custom:')) return RewardValueKind.text;
  if (method == 'qcoin' || method == 'carrotcoin') return RewardValueKind.count;
  if (method == 'merch') return RewardValueKind.text;
  return RewardValueKind.money;
}

/// 展示名称（现金 / 京东卡 / Q币 / 萝卜币 / 周边 / 自定义名）。
String rewardMethodLabel(String? key) {
  if (key == null || key.isEmpty) return '';
  if (key.startsWith('custom:')) return key.substring('custom:'.length);
  const map = {
    'cash': '现金',
    'jdcard': '京东卡',
    'qcoin': 'Q币',
    'carrotcoin': '萝卜币',
    'merch': '周边',
  };
  return map[key] ?? key;
}

/// 反序列化 rewardMethods JSON；异常时降级为单值 rewardMethod。
List<String> parseRewardMethods(String? rewardMethods, String? legacy) {
  if (rewardMethods != null && rewardMethods.isNotEmpty) {
    try {
      final arr = jsonDecode(rewardMethods);
      if (arr is List) {
        return arr.whereType<String>().toList();
      }
    } catch (_) {
      // 忽略
    }
  }
  return legacy != null && legacy.isNotEmpty ? [legacy] : [];
}
