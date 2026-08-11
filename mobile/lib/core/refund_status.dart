/// 工作账本出项的回款状态判定（1:1 对齐网页端 src/lib/refundStatus.ts）。
///
/// 出项本质是"我垫的钱，等报销/回款"。原状态只有"已回款 / 未回款"两态，
/// 但这里把未回款细分为"正常"与"超期"，方便页面高亮。
///
/// 判定基准用 [advanceDate] 而非 occurredAt 本身：补录进旧月的垫款，
/// occurredAt 是补录那天，按它算根本不到阈值，于是顶部不计、列表不标红，
/// 但明细里按 yearMonth 分组又能看到它 —— 用 min(occurredAt, 月末) 修正，
/// 式子单调（只会把基准日往前挪），不存在"修 A 漏 B"的反向风险。

/// 未回款超期阈值（天），对齐网页 REFUND_OVERDUE_DAYS。
const int refundOverdueDays = 30;

/// 回款三态，对齐网页 RefundStatus。
enum RefundState { refunded, pending, overdue }

/// 'YYYY-MM' → 该月最后一刻（UTC）。格式不对返回 null。
/// 用 UTC 而非本地时区：服务端与客户端必须算出逐毫秒相同的值。
DateTime? monthEndUtc(String yearMonth) {
  final m = RegExp(r'^(\d{4})-(0[1-9]|1[0-2])$').firstMatch(yearMonth);
  if (m == null) return null;
  final year = int.parse(m.group(1)!);
  final month = int.parse(m.group(2)!);
  // 下月 1 号 00:00 UTC 减 1ms（Dart 自动处理 12→次年 1 月溢出）。
  final next = DateTime.utc(year, month + 1, 1);
  return next.subtract(const Duration(milliseconds: 1));
}

/// 这笔钱**实际垫出去的时间**：min(occurredAt, 该 month 月末 UTC)。
DateTime advanceDate(DateTime occurredAt, String yearMonth) {
  final end = monthEndUtc(yearMonth);
  if (end == null) return occurredAt; // yearMonth 脏数据：退回老行为
  return !occurredAt.isAfter(end) ? occurredAt : end;
}

/// 判定一条出项的回款状态（对齐 refundStatus）。
///
/// [now] 应取"页面加载那一次"的时间，顶部汇总与每一行的红标共用同一时刻，
/// 避免页面开着几小时后顶部数字与列表红标自行漂移。
RefundState refundStatus(
  DateTime occurredAt,
  String yearMonth, {
  DateTime? refundedAt,
  DateTime? now,
  int overdueDays = refundOverdueDays,
}) {
  if (refundedAt != null) return RefundState.refunded;
  final base = now ?? DateTime.now();
  final ageMs = base.difference(advanceDate(occurredAt, yearMonth)).inMilliseconds;
  final ageDays = ageMs / (24 * 60 * 60 * 1000);
  return ageDays >= overdueDays ? RefundState.overdue : RefundState.pending;
}

/// 距离超期多少天；已超期返回超期天数（永远 ≥ 0）。对齐 daysSincePending。
int daysSincePending(
  DateTime occurredAt,
  String yearMonth, {
  DateTime? refundedAt,
  DateTime? now,
}) {
  if (refundedAt != null) return 0;
  final base = now ?? DateTime.now();
  final ageMs = base.difference(advanceDate(occurredAt, yearMonth)).inMilliseconds;
  if (ageMs < 0) return 0;
  return (ageMs / (24 * 60 * 60 * 1000)).floor();
}
