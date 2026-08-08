import 'package:flutter/foundation.dart';

/// 周期记账规则（demo，内存态）。
class RecurringRule {
  final String category;
  final int cents;
  final String period; // 如 "每月"
  final String nextDate; // 如 "2026-09-01"
  final bool greenAmount; // 金额是否用绿色（如工资入账）

  const RecurringRule({
    required this.category,
    required this.cents,
    required this.period,
    required this.nextDate,
    required this.greenAmount,
  });
}

/// 周期记账页状态（in-memory demo）。
class RecurringState extends ChangeNotifier {
  final List<RecurringRule> _rules = [
    const RecurringRule(
      category: '房租',
      cents: 350000,
      period: '每月',
      nextDate: '2026-09-01',
      greenAmount: false,
    ),
    const RecurringRule(
      category: '订阅',
      cents: 3800,
      period: '每月',
      nextDate: '2026-09-05',
      greenAmount: false,
    ),
    const RecurringRule(
      category: '工资',
      cents: 820000,
      period: '每月',
      nextDate: '2026-09-01',
      greenAmount: true,
    ),
  ];

  List<RecurringRule> get rules => _rules;

  int get count => _rules.length;

  void add({
    required String category,
    required int cents,
    required String period,
    required String nextDate,
  }) {
    _rules.add(RecurringRule(
      category: category,
      cents: cents,
      period: period,
      nextDate: nextDate,
      greenAmount: false,
    ));
    notifyListeners();
  }

  void remove(RecurringRule r) {
    _rules.remove(r);
    notifyListeners();
  }

  Future<void> load() async {
    notifyListeners();
  }
}
