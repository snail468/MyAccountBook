import 'package:flutter/foundation.dart';
import '../../data/local/general_entry_dao.dart';

/// 统计页状态。
///
/// 持有支出 / 收入 / 结余、月度趋势（收入 & 支出双线）、类别占比。
/// 数据来自本地 general_entries 聚合（见 [GeneralEntryDao]）。
class StatsState extends ChangeNotifier {
  /// 支出（分）。
  int expense = 0;

  /// 收入（分）。
  int income = 0;

  /// 结余 = 收入 - 支出。
  int get balance => income - expense;

  /// 月度趋势（收入 / 支出，单位分）。初始为空，load() 后填充。
  List<({String month, int income, int expense})> trend =
      <({String month, int income, int expense})>[];

  /// 类别占比（单位分）。初始为空，load() 后填充。
  List<({String label, int cents})> categories = <({String label, int cents})>[];

  Future<void> load() async {
    try {
      final dao = GeneralEntryDao();
      final totals = await dao.totalsAll();
      expense = totals.expense;
      income = totals.income;
      trend = await dao.monthlyTrend();
      categories = await dao.categoryBreakdown();
    } catch (_) {
      // 出错时保持空态，不抛出，保证页面可渲染。
      expense = 0;
      income = 0;
      trend = <({String month, int income, int expense})>[];
      categories = <({String label, int cents})>[];
    }
    notifyListeners();
  }
}
