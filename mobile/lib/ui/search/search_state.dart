import 'package:flutter/foundation.dart';
import '../../core/money.dart';

/// 搜索结果条目（demo）。
class SearchResult {
  final String title;
  final String subtitle;
  final int cents;
  final String type; // expense | income

  const SearchResult(this.title, this.subtitle, this.cents, this.type);
}

/// 搜索页状态（demo 数据）。
///
/// 持有查询关键字 [query] 与筛选 [filter]，并提供按关键字 + 类型过滤的结果列表。
class SearchState extends ChangeNotifier {
  String _query = '';
  String _filter = 'all'; // all | expense | income | time

  String get query => _query;
  String get filter => _filter;

  final List<SearchResult> _results = const [
    SearchResult('超市采购', '餐饮 · 08-12', -4500, 'expense'),
    SearchResult('工资到账', '收入 · 08-01', 820000, 'income'),
    SearchResult('地铁通勤', '交通 · 08-05', -600, 'expense'),
    SearchResult('电影票', '娱乐 · 08-09', -12000, 'expense'),
  ];

  List<SearchResult> get all => _results;

  void setQuery(String v) {
    _query = v;
    notifyListeners();
  }

  void setFilter(String v) {
    _filter = v;
    notifyListeners();
  }

  /// 按关键字（标题 / 副标 / 金额字符串）与筛选维度过滤。
  List<SearchResult> get filtered {
    final q = _query.trim().toLowerCase();
    return _results.where((r) {
      final matchQ = q.isEmpty ||
          r.title.toLowerCase().contains(q) ||
          r.subtitle.toLowerCase().contains(q) ||
          Money.formatCents(r.cents).toLowerCase().contains(q);
      final matchF = _filter == 'all' ||
          (_filter == 'expense' && r.type == 'expense') ||
          (_filter == 'income' && r.type == 'income') ||
          (_filter == 'time' && r.subtitle.contains('-'));
      return matchQ && matchF;
    }).toList();
  }

  Future<void> load() async {
    notifyListeners();
  }
}
