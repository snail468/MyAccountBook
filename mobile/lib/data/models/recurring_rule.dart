/// 周期记账规则（本地持久化，对应 recurring_rules 表）。
class RecurringRule {
  final String id; // 本地 id
  final String category;
  final int cents;
  final String period; // 如 "每月"
  final String nextDate; // 如 "2026-09-01"
  final bool greenAmount; // 金额是否用绿色（如工资入账）

  const RecurringRule({
    required this.id,
    required this.category,
    required this.cents,
    required this.period,
    required this.nextDate,
    required this.greenAmount,
  });

  factory RecurringRule.fromDb(Map<String, dynamic> m) => RecurringRule(
        id: m['id'] as String,
        category: m['category'] as String,
        cents: m['cents'] as int,
        period: m['period'] as String,
        nextDate: m['next_date'] as String,
        greenAmount: (m['green_amount'] as int? ?? 0) == 1,
      );

  Map<String, dynamic> toDb() => {
        'id': id,
        'category': category,
        'cents': cents,
        'period': period,
        'next_date': nextDate,
        'green_amount': greenAmount ? 1 : 0,
        'created_at': DateTime.now().millisecondsSinceEpoch,
      };
}
