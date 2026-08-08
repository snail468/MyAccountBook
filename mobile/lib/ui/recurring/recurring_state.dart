import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../../data/local/recurring_rule_dao.dart';
import '../../data/models/recurring_rule.dart';

export '../../data/models/recurring_rule.dart';

/// 周期记账页状态（本地持久化到 recurring_rules 表）。
class RecurringState extends ChangeNotifier {
  final List<RecurringRule> _rules = <RecurringRule>[];

  List<RecurringRule> get rules => _rules;

  int get count => _rules.length;

  Future<void> add({
    required String category,
    required int cents,
    required String period,
    required String nextDate,
  }) async {
    final rule = RecurringRule(
      id: const Uuid().v4(),
      category: category,
      cents: cents,
      period: period,
      nextDate: nextDate,
      greenAmount: false,
    );
    await RecurringRuleDao().insert(rule);
    _rules.add(rule);
    notifyListeners();
  }

  Future<void> remove(RecurringRule r) async {
    await RecurringRuleDao().delete(r.id);
    _rules.removeWhere((e) => e.id == r.id);
    notifyListeners();
  }

  Future<void> load() async {
    final list = await RecurringRuleDao().listAll();
    _rules.clear();
    _rules.addAll(list);
    notifyListeners();
  }
}
