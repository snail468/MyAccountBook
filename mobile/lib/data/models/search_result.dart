/// 搜索结果条目（由 general_entries 实时聚合，不落库）。
class SearchResult {
  final String title;
  final String subtitle;
  final int cents;
  final String type; // expense | income

  const SearchResult(this.title, this.subtitle, this.cents, this.type);
}
