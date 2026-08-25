/// 统计聚合用的归一化记录：把四个账本（工作 / 旅游 / 桃源 / 普通）统一成同一形状，
/// 对齐网页端 src/lib/stats.ts 的 StatRow。
///
/// 各 DAO 的 [statsRows] 负责按网页端 loadRows 的口径把原始行归一成这里，
/// 之后的分桶 / 类别占比 / 环比同比都是纯 Dart 计算（见 stats_state.dart）。
class StatRow {
  /// 发生时间（本地时区）。
  final DateTime occurredAt;

  /// 金额（分）。旅游账本已是本币（amount_base_cents）。
  final int amountCents;

  /// 'income' | 'expense'。
  final String direction;

  /// 类别（用于「支出构成 / 收入构成」占比；桃源取活动 topicTag）。
  final String category;

  /// 来源分量 key，对齐首页「总收入 A 的组成」的稳定键（见 income_prefs / 网页端
  /// lib/userPrefs.ts）：'work' / 'taoyuan:cash' / 'taoyuan:jd' /
  /// 'general:<id>' / 'general-expense:<id>' / 'travel-expense:<id>'。
  /// 统计页据此过滤——用户在首页取消勾选的来源不计入统计。
  /// 为 null 表示该行不对应任何分量（无对应开关，始终计入）。
  final String? sourceKey;

  const StatRow({
    required this.occurredAt,
    required this.amountCents,
    required this.direction,
    required this.category,
    this.sourceKey,
  });
}
