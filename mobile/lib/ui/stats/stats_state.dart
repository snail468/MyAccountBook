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

  /// 环比同比基准（单位分）。当前月 = 本地日历当月；prev = 上月；yoy = 去年同月。
  /// 由 [GeneralEntryDao.periodComparison] 填充。
  int curIncome = 0, curExpense = 0;
  int prevIncome = 0, prevExpense = 0;
  int yoyIncome = 0, yoyExpense = 0;

  Future<void> load() async {
    try {
      final dao = GeneralEntryDao();
      final totals = await dao.totalsAll();
      expense = totals.expense;
      income = totals.income;
      trend = await dao.monthlyTrend();
      categories = await dao.categoryBreakdown();
      final cmp = await dao.periodComparison();
      curIncome = cmp.curIncome;
      curExpense = cmp.curExpense;
      prevIncome = cmp.prevIncome;
      prevExpense = cmp.prevExpense;
      yoyIncome = cmp.yoyIncome;
      yoyExpense = cmp.yoyExpense;
    } catch (_) {
      // 出错时保持空态，不抛出，保证页面可渲染。
      expense = 0;
      income = 0;
      trend = <({String month, int income, int expense})>[];
      categories = <({String label, int cents})>[];
      curIncome = 0;
      curExpense = 0;
      prevIncome = 0;
      prevExpense = 0;
      yoyIncome = 0;
      yoyExpense = 0;
    }
    notifyListeners();
  }
}
