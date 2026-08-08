import 'package:flutter/foundation.dart';
import '../../core/money.dart';

/// 搜索结果条目。
class SearchResult {
  final String title;
  final String subtitle;
  final int cents;
  final String type; // expense | income

  const SearchResult(this.title, this.subtitle, this.cents, this.type);
}

/// 搜索页状态（in-memory，无后端，初始结果为空）。
///
/// 持有查询关键字 [query] 与筛选 [filter]，并提供按关键字 + 类型过滤的结果列表。
class SearchState extends ChangeNotifier {
  String _query = '';
  String _filter = 'all'; // all | expense | income | time

  String get query => _query;
  String get filter => _filter;

  final List<SearchResult> _results = const <SearchResult>[];

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
