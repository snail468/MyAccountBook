import 'package:sqflite/sqflite.dart';
import '../../core/money.dart';
import '../db/database.dart';
import '../models/general_entry.dart';
import '../models/search_result.dart';
import '../models/work_entry.dart';
import '../models/trip.dart';
import '../models/taoyuan_event.dart';
import 'ledger_dao.dart';

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

/// 全局搜索：跨四个账本（工作 / 普通 / 旅游 / 桃源）实时聚合，按关键字 + 方向 +
/// 类别 + 标签 + 金额区间 + 时间区间 + 来源筛选。
///
/// 逻辑 1:1 对齐网页端 `runSearch`（src/lib/searchExecute.ts）：每个来源单独扫描，
/// 各自适用的字段不同，某些条件对不上时**整体跳过该来源**（而不是忽略条件照查），
/// 避免「筛收入却搜出一堆支出」这类误导。
///
/// 结果实时从各表聚合，不单独建表（对齐网页端实时搜索语义）。
class SearchDao {
  final AppDatabase _db = AppDatabase.instance;

  Future<List<SearchResult>> searchAll(SearchFilters f) async {
    // 全空时不把整个库倒出来（对齐网页端 hasAnyFilter）。
    final hasAnyFilter = f.query.trim().isNotEmpty ||
        f.from.isNotEmpty ||
        f.to.isNotEmpty ||
        f.minYuan.trim().isNotEmpty ||
        f.maxYuan.trim().isNotEmpty ||
        f.category.trim().isNotEmpty ||
        f.tag.trim().isNotEmpty ||
        f.direction.isNotEmpty ||
        f.sources.length != 4; // 4 = kSearchSources 总量
    if (!hasAnyFilter) return const [];

    final db = await _db.database;

    // 账本名映射：结果徽标显示具体账本名（对齐网页端 ledger.name）。
    final ledgerNames = <String, String>{};
    try {
      final ledgers = await LedgerDao().listAll();
      for (final l in ledgers) ledgerNames[l.id] = l.name;
    } catch (_) {
      // 忽略：徽标回退到来源文案
    }

    final q = f.query.trim().toLowerCase();
    final minCents = Money.parseToCents(f.minYuan);
    final maxCents = Money.parseToCents(f.maxYuan);
    final fromMs = _parseDateStart(f.from);
    final toMs = _parseDateEnd(f.to);

    bool matchQ(String text) => q.isEmpty || text.toLowerCase().contains(q);
    bool matchAmount(int amount) =>
        (minCents == null || amount >= minCents) &&
        (maxCents == null || amount <= maxCents);
    bool matchDate(int ms) =>
        (fromMs == null || ms >= fromMs) && (toMs == null || ms <= toMs);

    // 聚合 (结果, 排序用时间毫秒)，最后按时间倒序归并。
    final hits = <(SearchResult, int)>[];

    // ---------------- 工作账本 ----------------
    // 工作条目没有 tags 字段，按标签筛时整个来源跳过。
    if (f.sources.contains('work') && f.tag.trim().isEmpty) {
      final rows = await db.query('work_entries',
          where: 'deleted_at IS NULL', orderBy: 'occurred_at DESC');
      for (final m in rows) {
        final e = WorkEntry.fromDb(m);
        if (!matchQ(e.note ?? '') && !matchQ(e.category)) continue;
        if (f.direction.isNotEmpty && e.direction != f.direction) continue;
        if (f.category.trim().isNotEmpty &&
            !e.category
                .toLowerCase()
                .contains(f.category.trim().toLowerCase())) continue;
        if (!matchAmount(e.amountCents)) continue;
        if (!matchDate(e.occurredAt)) continue;
        hits.add((
          SearchResult(
            id: e.id,
            ledgerId: e.ledgerId,
            source: 'work',
            ledgerName: ledgerNames[e.ledgerId],
            title: e.category,
            note: e.note,
            tags: null,
            amountCents: e.amountCents,
            direction: e.direction,
            dateYmd: _formatDate(e.occurredAt),
          ),
          e.occurredAt,
        ));
      }
    }

    // ---------------- 普通账本 ----------------
    if (f.sources.contains('general')) {
      final rows = await db.query('general_entries',
          where: 'deleted_at IS NULL', orderBy: 'occurred_at DESC');
      for (final m in rows) {
        final e = GeneralEntry.fromDb(m);
        final note = (e.note ?? '').toLowerCase();
        final tags = (e.tags ?? '').toLowerCase();
        final amountStr = Money.formatCents(e.amountCents).toLowerCase();
        if (q.isNotEmpty &&
            !e.category.toLowerCase().contains(q) &&
            !note.contains(q) &&
            !tags.contains(q) &&
            !amountStr.contains(q)) continue;
        if (f.direction.isNotEmpty && e.direction != f.direction) continue;
        if (f.category.trim().isNotEmpty &&
            !e.category
                .toLowerCase()
                .contains(f.category.trim().toLowerCase())) continue;
        if (f.tag.trim().isNotEmpty &&
            !(e.tags ?? '')
                .split(',')
                .map((t) => t.trim().toLowerCase())
                .where((t) => t.isNotEmpty)
                .contains(f.tag.trim().toLowerCase())) continue;
        if (!matchAmount(e.amountCents)) continue;
        if (!matchDate(e.occurredAt)) continue;
        hits.add((
          SearchResult(
            id: e.id,
            ledgerId: e.ledgerId,
            source: 'general',
            ledgerName: ledgerNames[e.ledgerId],
            title: e.category,
            note: e.note,
            tags: e.tags,
            amountCents: e.amountCents,
            direction: e.direction,
            dateYmd: _formatDate(e.occurredAt),
          ),
          e.occurredAt,
        ));
      }
    }

    // ---------------- 旅游账本 ----------------
    // 旅游支出恒为支出，筛"收入"时整个来源跳过；它也没有 tags。
    if (f.sources.contains('travel') &&
        f.direction != 'income' &&
        f.tag.trim().isEmpty) {
      final rows = await db.query('trip_expenses',
          where: 'deleted_at IS NULL', orderBy: 'occurred_at DESC');
      for (final m in rows) {
        final t = TripExpense.fromDb(m);
        if (q.isNotEmpty &&
            !t.title.toLowerCase().contains(q) &&
            !(t.note ?? '').toLowerCase().contains(q) &&
            !t.category.toLowerCase().contains(q)) continue;
        if (f.category.trim().isNotEmpty &&
            !t.category
                .toLowerCase()
                .contains(f.category.trim().toLowerCase())) continue;
        if (!matchAmount(t.amountBaseCents)) continue;
        if (!matchDate(t.occurredAt)) continue;
        hits.add((
          SearchResult(
            id: t.id,
            ledgerId: t.ledgerId,
            source: 'travel',
            ledgerName: ledgerNames[t.ledgerId],
            title: t.title,
            note: t.note,
            tags: null,
            amountCents: t.amountBaseCents,
            direction: 'expense',
            dateYmd: _formatDate(t.occurredAt),
          ),
          t.occurredAt,
        ));
      }
    }

    // ---------------- 桃源账本 ----------------
    // 活动没有 category / direction 概念，这两个条件一旦设置就跳过该来源。
    if (f.sources.contains('taoyuan') &&
        f.category.trim().isEmpty &&
        f.direction.isEmpty) {
      final rows = await db.query('taoyuan_events',
          where: 'deleted_at IS NULL', orderBy: 'published_at DESC');
      for (final m in rows) {
        final ev = TaoyuanEvent.fromDb(m);
        final content = (ev.content ?? '').toLowerCase();
        final reward = (ev.reward ?? '').toLowerCase();
        final topic = (ev.topicTag ?? '').toLowerCase();
        if (q.isNotEmpty &&
            !ev.title.toLowerCase().contains(q) &&
            !content.contains(q) &&
            !(ev.note ?? '').toLowerCase().contains(q) &&
            !reward.contains(q) &&
            !topic.contains(q)) continue;
        if (f.tag.trim().isNotEmpty &&
            !topic.contains(f.tag.trim().toLowerCase())) continue;
        // 展示金额取最靠后的阶段：到账 > 公示 > 预测（对齐网页端口径）。
        final amount =
            ev.paidCents ?? ev.announcedCents ?? ev.predictedCents ?? 0;
        if (!matchAmount(amount)) continue;
        if (!matchDate(ev.publishedAt)) continue;
        hits.add((
          SearchResult(
            id: ev.id,
            ledgerId: ev.ledgerId,
            source: 'taoyuan',
            ledgerName: ledgerNames[ev.ledgerId],
            title: ev.title,
            note: ev.note,
            tags: ev.topicTag,
            amountCents: amount,
            direction: 'income',
            dateYmd: _formatDate(ev.publishedAt),
          ),
          ev.publishedAt,
        ));
      }
    }

    hits.sort((a, b) => b.$2.compareTo(a.$2));
    return hits.map((h) => h.$1).toList();
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
