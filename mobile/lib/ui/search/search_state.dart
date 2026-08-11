import 'package:flutter/foundation.dart';
import '../../data/local/search_dao.dart';
import '../../data/models/search_result.dart';

export '../../data/models/search_result.dart';

/// 搜索来源（对齐网页端 SEARCH_SOURCES）。
const List<String> kSearchSources = ['general', 'work', 'travel', 'taoyuan'];

/// 来源徽标文案（对齐网页端 SOURCE_LABEL）。
const Map<String, String> kSourceLabel = {
  'general': '普通账本',
  'work': '工作账本',
  'travel': '旅游账本',
  'taoyuan': '桃源账本',
};

/// 每页条数（对齐网页端 DEFAULT_LIMIT 的本地等价：加载更多分页）。
const int kSearchPageSize = 20;

/// 搜索页状态。
///
/// 持有查询关键字与全部过滤维度（方向 / 类别 / 标签 / 金额区间 / 时间区间 /
/// 搜索范围），并提供 [activeCount]（生效中的筛选数，驱动「筛选」按钮角标）、
/// 分页后的 [filtered] 结果列表，以及 [loadMore] 增量加载。
///
/// 结果来自本地 general_entries 实时聚合（见 [SearchDao]）。
class SearchState extends ChangeNotifier {
  String _query = '';
  String _direction = ''; // '' | income | expense（对齐网页端 direction）
  String _category = '';
  String _tag = '';
  String _minYuan = '';
  String _maxYuan = '';
  String _from = ''; // yyyy-MM-dd
  String _to = ''; // yyyy-MM-dd
  List<String> _sources = List<String>.from(kSearchSources);

  /// 清空筛选时自增，供筛选面板据此重置输入框。
  int _resetNonce = 0;

  String get query => _query;
  String get direction => _direction;
  String get category => _category;
  String get tag => _tag;
  String get minYuan => _minYuan;
  String get maxYuan => _maxYuan;
  String get from => _from;
  String get to => _to;
  List<String> get sources => List<String>.from(_sources);
  int get resetNonce => _resetNonce;

  void setQuery(String v) {
    _query = v;
    _notifyAndLoad();
  }

  void setDirection(String v) {
    _direction = v;
    _notifyAndLoad();
  }

  void setCategory(String v) {
    _category = v;
    _notifyAndLoad();
  }

  void setTag(String v) {
    _tag = v;
    _notifyAndLoad();
  }

  void setMinYuan(String v) {
    _minYuan = v;
    _notifyAndLoad();
  }

  void setMaxYuan(String v) {
    _maxYuan = v;
    _notifyAndLoad();
  }

  void setFrom(String v) {
    _from = v;
    _notifyAndLoad();
  }

  void setTo(String v) {
    _to = v;
    _notifyAndLoad();
  }

  void toggleSource(String s) {
    if (_sources.contains(s)) {
      _sources.remove(s);
    } else {
      _sources.add(s);
    }
    _notifyAndLoad();
  }

  void _notifyAndLoad() {
    notifyListeners();
    load();
  }

  /// 生效中的筛选数（对齐网页端 activeFilterCount，含关键字 q）。
  int get activeCount {
    var n = 0;
    if (_query.trim().isNotEmpty) n += 1;
    if (_from.isNotEmpty) n += 1;
    if (_to.isNotEmpty) n += 1;
    if (_minYuan.trim().isNotEmpty) n += 1;
    if (_maxYuan.trim().isNotEmpty) n += 1;
    if (_category.trim().isNotEmpty) n += 1;
    if (_tag.trim().isNotEmpty) n += 1;
    if (_direction.isNotEmpty) n += 1;
    if (_sources.length != kSearchSources.length) n += 1;
    return n;
  }

  List<SearchResult> _results = const [];
  int _visible = kSearchPageSize;

  /// 当前页展示的结果（按 [kSearchPageSize] 分页）。
  List<SearchResult> get filtered {
    if (_visible >= _results.length) return _results;
    return _results.sublist(0, _visible);
  }

  /// 是否还有更多结果可加载。
  bool get hasMore => _visible < _results.length;

  Future<void> load() async {
    try {
      _results = await SearchDao().searchAll(SearchFilters(
        query: _query,
        direction: _direction,
        category: _category,
        tag: _tag,
        minYuan: _minYuan,
        maxYuan: _maxYuan,
        from: _from,
        to: _to,
        sources: _sources,
      ));
    } catch (_) {
      _results = const [];
    }
    _visible = kSearchPageSize;
    notifyListeners();
  }

  /// 加载下一页（对齐网页端「加载更多」）。
  void loadMore() {
    _visible = (_visible + kSearchPageSize).clamp(0, _results.length);
    notifyListeners();
  }

  /// 清空全部筛选条件并重新搜索（对齐网页端 清空筛选）。
  void resetFilters() {
    _direction = '';
    _category = '';
    _tag = '';
    _minYuan = '';
    _maxYuan = '';
    _from = '';
    _to = '';
    _sources = List<String>.from(kSearchSources);
    _resetNonce += 1;
    notifyListeners();
    load();
  }
}
