import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../../data/local/general_entry_dao.dart';
import '../../data/local/ledger_dao.dart';
import '../../data/local/recurring_rule_dao.dart';
import '../../data/local/work_entry_dao.dart';
import '../../data/models/general_entry.dart';
import '../../data/models/recurring_rule.dart';
import '../../data/models/work_entry.dart';
import '../../sync/sync_service.dart';

export '../../data/models/recurring_rule.dart';

/// 周期记账页状态（本地持久化到 recurring_rules 表）。
///
/// 离线优先：[D1] 本期新增规则仅落本地（serverId=null，不推送 POST）；
/// 删除已同步规则先入队 DELETE（clientId=serverId，防离线复活 [D4]）；
/// 停用/改为仅提醒/改为自动记账切换先落本地再入队 PATCH active/autoCreate。
///
/// [runDue] 本地实现网页端 `materializeDueRules`：对 active && autoCreate 的规则
/// 计算到期未生成的期次（纯函数见本文件底部，1:1 移植 src/lib/recurring.ts），
/// 落 GeneralEntry / WorkEntry 并回写 lastGeneratedAt，保证幂等、可补跑多期。
class RecurringState extends ChangeNotifier {
  final List<RecurringRule> _rules = <RecurringRule>[];
  final SyncService _sync = SyncService.instance;

  List<RecurringRule> get rules => _rules;

  bool _loading = true;
  bool get loading => _loading;

  int get count => _rules.length;

  /// 新增规则（1:1 对齐网页端 POST /api/recurring 的表单字段）。
  ///
  /// 离线优先：仅落本地（synced=0, serverId=null），不推送服务端 [D1]。
  Future<void> add({
    required String category,
    required int cents,
    required String direction, // 'income' | 'expense'
    required String target, // 'work' | 'general'
    String? ledgerId,
    String? ledgerName,
    String? note,
    required String frequency, // 'monthly' | 'weekly'
    int? dayOfMonth,
    int? dayOfWeek,
    required String startDate, // yyyy-MM-dd
    String? endDate, // yyyy-MM-dd | null
    required bool autoCreate,
  }) async {
    final rule = RecurringRule(
      id: const Uuid().v4(),
      category: category,
      cents: cents,
      period: frequency == 'monthly' ? '每月' : '每周',
      nextDate: '',
      greenAmount: direction == 'income',
      serverId: null,
      synced: 0, // 本地新建、尚未推送服务端
      target: target,
      ledgerId: ledgerId,
      ledgerName: ledgerName,
      direction: direction,
      frequency: frequency,
      dayOfMonth: dayOfMonth,
      dayOfWeek: dayOfWeek,
      startDate: startDate,
      endDate: endDate,
      lastGeneratedAt: null,
      active: true,
      autoCreate: autoCreate,
      note: note != null && note.isNotEmpty ? note : null,
    );
    await RecurringRuleDao().insert(rule);
    _rules.add(rule);
    notifyListeners();
  }

  Future<void> remove(RecurringRule r) async {
    if (r.serverId != null && r.serverId!.isNotEmpty) {
      // 已同步：硬删本地 + 入队 DELETE（clientId 存 serverId 供离线防复活 [D4]）。
      await _sync.enqueue(
        method: 'DELETE',
        path: '/recurring/${r.serverId}',
        entity: 'recurring_rule',
        entityLocalId: r.id,
        clientId: r.serverId,
      );
    } else {
      // 本地新建未推送：服务端无对应行，仅清掉待操作即可。
      await _sync.removePendingFor(r.id);
    }
    await RecurringRuleDao().delete(r.id);
    _rules.removeWhere((e) => e.id == r.id);
    notifyListeners();
  }

  /// 停用（active=false）。已同步则入队 PATCH {active:false}。[D1]
  Future<void> disable(RecurringRule r) async {
    final updated = r.copyWith(active: false);
    await RecurringRuleDao().upsert(updated);
    _replaceInList(updated);
    if (r.serverId != null && r.serverId!.isNotEmpty) {
      await _sync.enqueue(
        method: 'PATCH',
        path: '/recurring/${r.serverId}',
        body: {'active': false},
        entity: 'recurring_rule',
        entityLocalId: r.id,
      );
    }
    notifyListeners();
  }

  /// 启用（active=true）。已同步则入队 PATCH {active:true}。[D1]
  Future<void> enable(RecurringRule r) async {
    final updated = r.copyWith(active: true);
    await RecurringRuleDao().upsert(updated);
    _replaceInList(updated);
    if (r.serverId != null && r.serverId!.isNotEmpty) {
      await _sync.enqueue(
        method: 'PATCH',
        path: '/recurring/${r.serverId}',
        body: {'active': true},
        entity: 'recurring_rule',
        entityLocalId: r.id,
      );
    }
    notifyListeners();
  }

  /// 改为仅提醒（autoCreate=false，仍保留规则但不自动记账）。已同步则入队
  /// PATCH {autoCreate:false}。[D1]
  Future<void> setReminderOnly(RecurringRule r) async {
    final updated = r.copyWith(autoCreate: false);
    await RecurringRuleDao().upsert(updated);
    _replaceInList(updated);
    if (r.serverId != null && r.serverId!.isNotEmpty) {
      await _sync.enqueue(
        method: 'PATCH',
        path: '/recurring/${r.serverId}',
        body: {'autoCreate': false},
        entity: 'recurring_rule',
        entityLocalId: r.id,
      );
    }
    notifyListeners();
  }

  /// 改为自动记账（autoCreate=true，恢复到期自动生成）。已同步则入队
  /// PATCH {autoCreate:true}。[D1]
  Future<void> setAutoCreate(RecurringRule r) async {
    final updated = r.copyWith(autoCreate: true);
    await RecurringRuleDao().upsert(updated);
    _replaceInList(updated);
    if (r.serverId != null && r.serverId!.isNotEmpty) {
      await _sync.enqueue(
        method: 'PATCH',
        path: '/recurring/${r.serverId}',
        body: {'autoCreate': true},
        entity: 'recurring_rule',
        entityLocalId: r.id,
      );
    }
    notifyListeners();
  }

  /// 本地生成到期的账（1:1 对应网页端 `materializeDueRules`）。
  ///
  /// 只处理 active && autoCreate 的规则；按 [dueOccurrences] 算出截至今天仍未生成
  /// 的期次，落成 GeneralEntry / WorkEntry，并把 lastGeneratedAt 推进到最后一期，
  /// 保证重复调用幂等、且能补跑多期（容器停了两个月也一起补上）。
  ///
  /// 返回 {created, truncatedRules}，与网页端 MaterializeResult 一致，供页面弹窗展示。
  Future<({int created, int truncatedRules})> runDue() async {
    final now = DateTime.now();
    int created = 0;
    int truncatedRules = 0;

    final workLedgers = await LedgerDao().listByKind('work');
    final workLedgerId = workLedgers.isNotEmpty ? workLedgers.first.id : null;
    final generalDao = GeneralEntryDao();
    final workDao = WorkEntryDao();

    for (final r in List<RecurringRule>.from(_rules)) {
      if (!r.active || !r.autoCreate) continue;
      final sched = buildSchedule(r);
      if (sched == null) continue;
      if (r.direction != 'income' && r.direction != 'expense') continue;

      final lastGen = r.lastGeneratedAt != null
          ? DateTime.tryParse(r.lastGeneratedAt!)
          : null;
      final due = dueOccurrences(sched, lastGen, now);
      if (due.dates.isEmpty) continue;
      if (due.truncated) truncatedRules += 1;

      // 解析目标账本 id：工作账本取本地 work 账本；general 用规则自带 ledgerId。
      final String? ledgerId;
      if (r.target == 'work') {
        ledgerId = workLedgerId;
      } else {
        ledgerId = r.ledgerId;
      }
      if (ledgerId == null || ledgerId.isEmpty) continue;

      try {
        for (final d in due.dates) {
          final occurredAt = d.millisecondsSinceEpoch;
          if (r.target == 'work') {
            await workDao.insert(WorkEntry(
              id: const Uuid().v4(),
              ledgerId: ledgerId,
              yearMonth: '${d.year}-${d.month.toString().padLeft(2, '0')}',
              category: r.category,
              direction: r.direction!,
              amountCents: r.cents,
              note: r.note,
              occurredAt: occurredAt,
              synced: 0,
            ));
          } else {
            await generalDao.insert(GeneralEntry(
              id: const Uuid().v4(),
              ledgerId: ledgerId,
              direction: r.direction!,
              category: r.category,
              amountCents: r.cents,
              note: r.note,
              occurredAt: occurredAt,
              synced: 0,
            ));
          }
          created += 1;
        }
        final updated =
            r.copyWith(lastGeneratedAt: due.dates.last.toIso8601String());
        await RecurringRuleDao().upsert(updated);
        _replaceInList(updated);
      } catch (_) {
        // 单条规则失败不能影响其它规则，更不能让首页打不开
      }
    }

    notifyListeners();
    return (created: created, truncatedRules: truncatedRules);
  }

  void _replaceInList(RecurringRule updated) {
    final idx = _rules.indexWhere((e) => e.id == updated.id);
    if (idx >= 0) _rules[idx] = updated;
  }

  Future<void> load() async {
    _loading = true;
    notifyListeners();
    final list = await RecurringRuleDao().listAll();
    _rules.clear();
    _rules.addAll(list);
    _loading = false;
    notifyListeners();
  }
}

/// 排期描述所用数据结构（1:1 移植 src/lib/recurring.ts 的 RecurringSchedule）。
class RecurringSchedule {
  final String frequency; // 'monthly' | 'weekly'
  final int? dayOfMonth; // 1-31
  final int? dayOfWeek; // 0=周日 … 6=周六
  final DateTime startDate;
  final DateTime? endDate;

  const RecurringSchedule({
    required this.frequency,
    this.dayOfMonth,
    this.dayOfWeek,
    required this.startDate,
    this.endDate,
  });
}

/// 由 [RecurringRule] 构造排期；字段不全（legacy 本地规则）时返回 null。
RecurringSchedule? buildSchedule(RecurringRule r) {
  if (r.frequency == null) return null;
  final start = r.startDate != null ? DateTime.tryParse(r.startDate!) : null;
  if (start == null) return null;
  final end = r.endDate != null ? DateTime.tryParse(r.endDate!) : null;
  return RecurringSchedule(
    frequency: r.frequency!,
    dayOfMonth: r.dayOfMonth,
    dayOfWeek: r.dayOfWeek,
    startDate: start,
    endDate: end,
  );
}

// ---------------------------------------------------------------------------
// 以下为 src/lib/recurring.ts 的纯函数移植（不碰数据库）。注释见原文件。
// ---------------------------------------------------------------------------

DateTime _startOfDay(DateTime d) => DateTime(d.year, d.month, d.day);

int _daysInMonth(int year, int month) {
  final next = (month == 12) ? DateTime(year + 1, 1, 1) : DateTime(year, month + 1, 1);
  return next.subtract(const Duration(days: 1)).day;
}

DateTime _clampedDate(int year, int month, int day) {
  final max = _daysInMonth(year, month);
  return DateTime(year, month, day > max ? max : day);
}

DateTime _firstOccurrence(RecurringSchedule s) {
  final start = _startOfDay(s.startDate);
  if (s.frequency == 'monthly') {
    final day = s.dayOfMonth ?? 1;
    final candidate = _clampedDate(start.year, start.month, day);
    if (!candidate.isBefore(start)) return candidate;
    return _clampedDate(start.year, start.month + 1, day);
  }
  final want = s.dayOfWeek ?? 1;
  var d = start;
  while (d.weekday % 7 != want) {
    d = d.add(const Duration(days: 1));
  }
  return d;
}

DateTime _nextOccurrence(RecurringSchedule s, DateTime prev) {
  if (s.frequency == 'monthly') {
    final day = s.dayOfMonth ?? 1;
    return _clampedDate(prev.year, prev.month + 1, day);
  }
  return DateTime(prev.year, prev.month, prev.day + 7);
}

bool _isExpired(RecurringSchedule s, DateTime on) {
  if (s.endDate == null) return false;
  return _startOfDay(on).isAfter(_startOfDay(s.endDate!));
}

/// 算出截至 now 为止、尚未生成的所有期次（支持补跑多期）。[maxCatchUp] 为护栏。
({List<DateTime> dates, bool truncated}) dueOccurrences(
  RecurringSchedule s,
  DateTime? lastGenerated,
  DateTime now, [
  int maxCatchUp = 24,
]) {
  final today = _startOfDay(now);
  final all = <DateTime>[];
  var cursor = lastGenerated != null
      ? _nextOccurrence(s, _startOfDay(lastGenerated))
      : _firstOccurrence(s);

  const hardLimit = 5000;
  while (!cursor.isAfter(today) && !_isExpired(s, cursor) && all.length < hardLimit) {
    all.add(cursor);
    cursor = _nextOccurrence(s, cursor);
  }

  if (all.length > maxCatchUp) {
    return (dates: all.sublist(all.length - maxCatchUp), truncated: true);
  }
  return (dates: all, truncated: false);
}

/// 下一次将要生成的日期（用于界面「下次：yyyy-MM-dd」）。已过期返回 null。
DateTime? upcomingDate(RecurringSchedule s, DateTime? lastGenerated, DateTime now) {
  final today = _startOfDay(now);
  var cursor = lastGenerated != null
      ? _nextOccurrence(s, _startOfDay(lastGenerated))
      : _firstOccurrence(s);
  while (!cursor.isAfter(today)) {
    if (_isExpired(s, cursor)) return null;
    cursor = _nextOccurrence(s, cursor);
  }
  return _isExpired(s, cursor) ? null : cursor;
}

/// 界面用的中文描述（每月 n 号 / 每x）。
String describeSchedule(RecurringSchedule s) {
  if (s.frequency == 'monthly') {
    final d = s.dayOfMonth ?? 1;
    return d > 28 ? '每月 $d 号（不足则当月最后一天）' : '每月 $d 号';
  }
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return '每${names[s.dayOfWeek ?? 1]}';
}
