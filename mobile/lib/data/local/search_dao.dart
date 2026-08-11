import 'package:sqflite/sqflite.dart';
import '../../core/money.dart';
import '../db/database.dart';
import '../models/general_entry.dart';
import '../models/search_result.dart';

/// 搜索过滤条件（对齐网页端 SearchFilters）。
///
/// 金额以「元」字符串传入，落库前换算成分；日期为 yyyy-MM-dd。
class SearchFilters {
  final String query;
  final String direction; // '' | income | expense
  final String category;
  final String tag;
  final String minYuan;
  final String maxYuan;
  final String from; // yyyy-MM-dd
  final String to; // yyyy-MM-dd
  final List<String> sources;

  const SearchFilters({
    this.query = '',
    this.direction = '',
    this.category = '',
    this.tag = '',
    this.minYuan = '',
    this.maxYuan = '',
    this.from = '',
    this.to = '',
    this.sources = const ['general'],
  });
}

/// 全局搜索：跨普通账本条目，按关键字 + 方向 + 类别 + 标签 + 金额区间 + 时间区间筛选。
///
/// 结果实时从 general_entries 聚合，不单独建表（对齐网页端实时搜索语义）。
class SearchDao {
  final AppDatabase _db = AppDatabase.instance;

  Future<List<SearchResult>> searchAll(SearchFilters f) async {
    // 当前本地只聚合普通账本；范围不含 general 时直接返回空（避免无意义扫描）。
    if (!f.sources.contains('general')) return const [];

    final db = await _db.database;
    final rows = await db.query(
      'general_entries',
      where: 'deleted_at IS NULL',
      orderBy: 'occurred_at DESC',
    );
    final entries = rows.map(GeneralEntry.fromDb).toList();

    final q = f.query.trim().toLowerCase();
    final minCents = Money.parseToCents(f.minYuan);
    final maxCents = Money.parseToCents(f.maxYuan);
    final fromMs = _parseDateStart(f.from);
    final toMs = _parseDateEnd(f.to);

    final results = <SearchResult>[];
    for (final e in entries) {
      // 关键字：类别 / 备注 / 标签 / 金额字符串（对齐网页端可搜文本）。
      final amountStr = Money.formatCents(e.amountCents).toLowerCase();
      final note = (e.note ?? '').toLowerCase();
      final tags = (e.tags ?? '').toLowerCase();
      final matchQ = q.isEmpty ||
          e.category.toLowerCase().contains(q) ||
          note.contains(q) ||
          tags.contains(q) ||
          amountStr.contains(q);

      // 方向（'' 表示不限）。
      final matchDir = f.direction.isEmpty || e.direction == f.direction;

      // 类别（子串）。
      final matchCat = f.category.trim().isEmpty ||
          e.category.toLowerCase().contains(f.category.trim().toLowerCase());

      // 标签（任一匹配）。
      final matchTag = f.tag.trim().isEmpty ||
          (e.tags ?? '')
              .split(',')
              .map((t) => t.trim().toLowerCase())
              .where((t) => t.isNotEmpty)
              .contains(f.tag.trim().toLowerCase());

      // 金额区间（元→分）。
      final matchMin = minCents == null || e.amountCents >= minCents;
      final matchMax = maxCents == null || e.amountCents <= maxCents;

      // 时间区间（含当天末尾）。
      final matchFrom = fromMs == null || e.occurredAt >= fromMs;
      final matchTo = toMs == null || e.occurredAt <= toMs;

      if (matchQ &&
          matchDir &&
          matchCat &&
          matchTag &&
          matchMin &&
          matchMax &&
          matchFrom &&
          matchTo) {
        results.add(SearchResult(
          id: e.id,
          ledgerId: e.ledgerId,
          source: 'general',
          ledgerName: null,
          title: e.category,
          note: e.note,
          tags: e.tags,
          amountCents: e.amountCents,
          direction: e.direction,
          dateYmd: _formatDate(e.occurredAt),
        ));
      }
    }
    return results;
  }

  /// yyyy-MM-dd -> 当天 00:00:00.000（本地）。
  static int? _parseDateStart(String raw) {
    if (raw.trim().isEmpty) return null;
    final d = DateTime.tryParse(raw);
    if (d == null) return null;
    return d.millisecondsSinceEpoch;
  }

  /// yyyy-MM-dd -> 当天 23:59:59.999（本地），保证「到某日」含当天。
  static int? _parseDateEnd(String raw) {
    if (raw.trim().isEmpty) return null;
    final d = DateTime.tryParse(raw);
    if (d == null) return null;
    return d
        .add(const Duration(
            hours: 23, minutes: 59, seconds: 59, milliseconds: 999))
        .millisecondsSinceEpoch;
  }

  static String _formatDate(int millis) {
    final d = DateTime.fromMillisecondsSinceEpoch(millis);
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }
}
