import 'package:flutter/foundation.dart';

/// 统计页状态（in-memory，无后端，初始为空，等待接入真实账目数据）。
///
/// 持有支出 / 收入 / 结余、月度趋势（收入 & 支出双线）、类别占比。
class StatsState extends ChangeNotifier {
  /// 支出（分）。
  int expense = 0;

  /// 收入（分）。
  int income = 0;

  /// 结余 = 收入 - 支出。
  int get balance => income - expense;

  /// 月度趋势（收入 / 支出，单位分）。初始为空。
  final List<({String month, int income, int expense})> trend = const [];

  /// 类别占比（单位分）。初始为空。
  final List<({String label, int cents})> categories = const [];

  Future<void> load() async {
    notifyListeners();
  }
}
