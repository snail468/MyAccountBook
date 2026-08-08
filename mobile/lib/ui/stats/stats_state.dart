import 'package:flutter/foundation.dart';

/// 统计页状态（demo 数据）。
///
/// 持有支出 / 收入 / 结余、12 个月趋势（收入 & 支出双线）、4 个类别占比。
class StatsState extends ChangeNotifier {
  /// 支出（分）。
  int expense = 1234567;

  /// 收入（分）。
  int income = 2345678;

  /// 结余 = 收入 - 支出。
  int get balance => income - expense;

  /// 12 个月趋势（收入 / 支出，单位分）。
  final List<({String month, int income, int expense})> trend = const [
    (month: '1月', income: 200000, expense: 120000),
    (month: '2月', income: 180000, expense: 150000),
    (month: '3月', income: 260000, expense: 130000),
    (month: '4月', income: 220000, expense: 170000),
    (month: '5月', income: 300000, expense: 140000),
    (month: '6月', income: 240000, expense: 190000),
    (month: '7月', income: 280000, expense: 160000),
    (month: '8月', income: 320000, expense: 210000),
    (month: '9月', income: 230000, expense: 150000),
    (month: '10月', income: 270000, expense: 180000),
    (month: '11月', income: 310000, expense: 200000),
    (month: '12月', income: 290000, expense: 170000),
  ];

  /// 类别占比（演示 4 类，单位分）。
  final List<({String label, int cents})> categories = const [
    (label: '餐饮', cents: 320000),
    (label: '交通', cents: 180000),
    (label: '购物', cents: 250000),
    (label: '娱乐', cents: 90000),
  ];

  Future<void> load() async {
    notifyListeners();
  }
}
