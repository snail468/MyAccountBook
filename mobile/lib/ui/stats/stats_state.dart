import 'package:flutter/foundation.dart';
import '../../data/local/general_entry_dao.dart';
import '../../data/local/work_entry_dao.dart';
import '../../data/local/trip_dao.dart';
import '../../data/local/event_dao.dart';
import '../../data/models/stats_row.dart';

/// 统计页状态。
///
/// 聚合四个账本（工作 / 旅游 / 桃源 / 普通）的现金流，1:1 对齐网页端
/// src/app/stats/page.tsx 的 [loadRows] + src/lib/stats.ts 的纯计算。
///
/// 窗口取 13 个月：最近 12 个月用于画图 / 顶部汇总，第 13 个月（最早的那个）
/// 只给同比垫底（网页端同样多取一个月，否则去年同月算不出来）。
class StatsState extends ChangeNotifier {
  /// 支出（分）。来自最近 12 个月四个账本的合计。
  int expense = 0;

  /// 收入（分）。来自最近 12 个月四个账本的合计。
  int income = 0;

  /// 结余 = 收入 - 支出。
  int get balance => income - expense;

  /// 月度趋势（收入 / 支出，单位分）。最近 12 个月，升序，空月份值为 0。
  List<({String month, int income, int expense})> trend =
      <({String month, int income, int expense})>[];

  /// 支出类别占比（单位分）。网页端「支出构成」卡。
  List<({String label, int cents})> categories = <({String label, int cents})>[];

  /// 收入类别占比（单位分）。网页端「收入构成」卡。
  List<({String label, int cents})> incomeCategories =
      <({String label, int cents})>[];

  /// 环比同比基准（单位分）。current = 本地日历当月；prev = 上月；yoy = 去年同月。
  int curIncome = 0, curExpense = 0;
  int prevIncome = 0, prevExpense = 0;
  int yoyIncome = 0, yoyExpense = 0;

  /// 同比是否有「去年同月」可对比：窗口满 13 个月且那个月有记录。
  /// 否（还没满一年）时网页端显示「还没满一年」，环比卡永远有数据。
  bool hasYoy = true;

  Future<void> load() async {
    try {
      final now = DateTime.now();
      const months = 13;
      final keys = _recentMonthKeys(now, months);
      final since = _windowStartMs(now, months);

      // 四个账本统一归一成 StatRow，再一起聚合（对齐网页端 loadRows 合并 rows）。
      final rows = [
        ...await GeneralEntryDao().statsRows(since),
        ...await WorkEntryDao().statsRows(since),
        ...await TripDao().statsRows(since),
        ...await EventDao().statsRows(since),
      ];

      // 13 个连续月份的桶；画图 / 汇总只取后 12 个（visible）。
      final buckets = _bucketByMonth(rows, keys);
      final visible = buckets.length > 1 ? buckets.sublist(1) : buckets;

      income = visible.fold(0, (s, b) => s + b.income);
      expense = visible.fold(0, (s, b) => s + b.expense);
      trend = visible
          .map((b) => (month: b.key, income: b.income, expense: b.expense))
          .toList();

      // 环比：用 13 桶列表的末两个月（与网页端 monthOverMonth(buckets) 一致）。
      final cur = buckets.last;
      final prev = buckets[buckets.length - 2];
      curIncome = cur.income;
      curExpense = cur.expense;
      prevIncome = prev.income;
      prevExpense = prev.expense;

      // 同比：末月 vs 去年同月（索引 -13）。那个月一条记录都没有 => 还没满一年。
      hasYoy = false;
      if (buckets.length >= 13) {
        final lastYear = buckets[buckets.length - 13];
        if (lastYear.income != 0 || lastYear.expense != 0) {
          hasYoy = true;
          yoyIncome = lastYear.income;
          yoyExpense = lastYear.expense;
        }
      }

      final expenseShare = _categoryShare(rows, 'expense', 8);
      final incomeShare = _categoryShare(rows, 'income', 8);
      categories =
          expenseShare.map((s) => (label: s.category, cents: s.cents)).toList();
      incomeCategories =
          incomeShare.map((s) => (label: s.category, cents: s.cents)).toList();
    } catch (_) {
      // 出错时保持空态，不抛出，保证页面可渲染。
      expense = 0;
      income = 0;
      trend = <({String month, int income, int expense})>[];
      categories = <({String label, int cents})>[];
      incomeCategories = <({String label, int cents})>[];
      curIncome = 0;
      curExpense = 0;
      prevIncome = 0;
      prevExpense = 0;
      yoyIncome = 0;
      yoyExpense = 0;
      hasYoy = true;
    }
    notifyListeners();
  }

  // ---- 纯计算：1:1 对齐网页端 src/lib/stats.ts ----

  /// 本地时区的 YYYY-MM（刻意不用 UTC，避免跨时区把月初/月末算错）。
  static String _monthKeyOf(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}';

  /// 从 [now] 往前数 [count] 个月（含当月），升序。
  static List<String> _recentMonthKeys(DateTime now, int count) {
    final keys = <String>[];
    for (var i = count - 1; i >= 0; i--) {
      // 用 1 号构造，避免 31 号往前推一个月落到"下个月"。
      final d = DateTime(now.year, now.month - i, 1);
      keys.add(_monthKeyOf(d));
    }
    return keys;
  }

  /// 窗口起点：count 个月前的 1 号 00:00（本地时区），毫秒。
  static int _windowStartMs(DateTime now, int count) =>
      DateTime(now.year, now.month - (count - 1), 1).millisecondsSinceEpoch;

  /// 按月份分桶；没有记录的月份也出现（值为 0），否则折线图会跳过空月份。
  static List<({String key, int income, int expense})> _bucketByMonth(
    List<StatRow> rows,
    List<String> keys,
  ) {
    final map = <String, ({int income, int expense})>{};
    for (final k in keys) map[k] = (income: 0, expense: 0);
    for (final r in rows) {
      final key = _monthKeyOf(r.occurredAt);
      final cur = map[key];
      if (cur == null) continue; // 落在窗口外的记录直接忽略
      map[key] = r.direction == 'income'
          ? (income: cur.income + r.amountCents, expense: cur.expense)
          : (income: cur.income, expense: cur.expense + r.amountCents);
    }
    return keys
        .map((k) {
          final v = map[k]!;
          return (key: k, income: v.income, expense: v.expense);
        })
        .toList();
  }

  /// 类别占比，降序；超过 [topN] 的合并成「其他」。百分比交给卡片按展示列表重算。
  static List<({String category, int cents})> _categoryShare(
    List<StatRow> rows,
    String direction,
    int topN,
  ) {
    final map = <String, int>{};
    var total = 0;
    for (final r in rows) {
      if (r.direction != direction) continue;
      map[r.category] = (map[r.category] ?? 0) + r.amountCents;
      total += r.amountCents;
    }
    if (total == 0) return [];
    final sorted = map.entries.toList()
      ..sort((a, b) {
        final c = b.value.compareTo(a.value);
        if (c != 0) return c;
        return a.key.compareTo(b.key); // 同额按类别名升序
      });
    final head = sorted.take(topN).toList();
    final tail = sorted.skip(topN).toList();
    final result = head.map((h) => (category: h.key, cents: h.value)).toList();
    if (tail.isNotEmpty) {
      final cents = tail.fold(0, (s, e) => s + e.value);
      result.add((category: '其他', cents: cents));
    }
    return result;
  }
}
