/// 搜索结果条目（跨账本归一并实时聚合，不落库）。
///
/// 字段对齐网页端 [SearchHit]：
///   · [source] 决定来源徽标（普通 / 工作 / 桃源 / 旅游账本）；
///   · [note] / [tags] / [dateYmd] / [direction] 用于结果卡片的富展示；
///   · [amountCents] 用于右侧金额（收入绿、支出 ink900，对齐网页端）。
class SearchResult {
  final String id;
  final String? ledgerId;
  /// 来源：general | work | travel | taoyuan。
  final String source;
  /// 具体账本名（普通账本可能为 null，回退到 [kSourceLabel]）。
  final String? ledgerName;
  /// 主标题：类别或活动标题。
  final String title;
  final String? note;
  /// 逗号分隔的标签原文；渲染前用 [tagList] 切分。
  final String? tags;
  /// 本币金额（分）。桃源活动等无金额时可为 0。
  final int amountCents;
  /// 收支方向：income | expense。
  final String direction;
  /// 展示用日期 yyyy-MM-dd。
  final String dateYmd;

  const SearchResult({
    required this.id,
    this.ledgerId,
    required this.source,
    this.ledgerName,
    required this.title,
    this.note,
    this.tags,
    required this.amountCents,
    required this.direction,
    required this.dateYmd,
  });

  /// 逗号分隔的标签切成数组、去空（对齐网页端 splitTags）。
  List<String> get tagList {
    if (tags == null || tags!.isEmpty) return const [];
    return tags!
        .split(',')
        .map((t) => t.trim())
        .where((t) => t.isNotEmpty)
        .toList();
  }
}
