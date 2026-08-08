import 'package:sqflite/sqflite.dart';
import '../../core/money.dart';
import '../db/database.dart';
import '../models/general_entry.dart';
import '../models/search_result.dart';

/// 全局搜索：跨普通账本条目，按关键字 + 类型筛选。
///
/// 搜索结果实时从 general_entries 聚合，不单独建表。
class SearchDao {
  final AppDatabase _db = AppDatabase.instance;

  Future<List<SearchResult>> searchAll(String query, String filter) async {
    final db = await _db.database;
    final rows = await db.query(
      'general_entries',
      where: 'deleted_at IS NULL',
      orderBy: 'occurred_at DESC',
    );
    final entries = rows.map(GeneralEntry.fromDb).toList();
    final q = query.trim().toLowerCase();
    final results = <SearchResult>[];
    for (final e in entries) {
      final title = e.category;
      final subtitle = _formatDate(e.occurredAt);
      final amountStr = Money.formatCents(e.amountCents).toLowerCase();
      final note = (e.note ?? '').toLowerCase();
      final matchQ = q.isEmpty ||
          title.toLowerCase().contains(q) ||
          subtitle.toLowerCase().contains(q) ||
          amountStr.contains(q) ||
          note.contains(q);
      final type = e.direction; // expense | income
      final matchF = filter == 'all' ||
          (filter == 'expense' && type == 'expense') ||
          (filter == 'income' && type == 'income') ||
          (filter == 'time' && subtitle.contains('-'));
      if (matchQ && matchF) {
        results.add(SearchResult(title, subtitle, e.amountCents, type));
      }
    }
    return results;
  }

  static String _formatDate(int millis) {
    final d = DateTime.fromMillisecondsSinceEpoch(millis);
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }
}
