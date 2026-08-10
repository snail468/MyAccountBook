/// 周期记账规则（本地持久化，对应 recurring_rules 表）。
///
/// 离线优先 + 服务端对账：新增 `serverId`/`target`/`ledgerId`/`ledgerName`/
/// `direction`/`frequency`/`dayOfMonth`/`dayOfWeek`/`startDate`/`endDate`/
/// `lastGeneratedAt`/`active`/`autoCreate`/`note`/`synced` 等字段，
/// 用于登录后从 [RecurringApi] 拉取并双向同步（同 v2.0.30 的 server_id 复用模式）。
///
/// 金额一律分（cents）；展示经 [Money.formatCents]。
class RecurringRule {
  final String id; // 本地 id（永远本地 UUID）
  final String category;
  final int cents;
  final String period; // 遗留展示串 每月/每周（本地新建用）
  final String nextDate; // 遗留展示串（本地新建用）
  final bool greenAmount; // 金额是否用绿色（如工资入账，= direction=='income'）

  final String? serverId; // 服务端 cuid（同步前为 null）
  final String? target; // 'work' | 'general'
  final String? ledgerId;
  final String? ledgerName; // 来自 ledger.name（服务端）
  final String? direction; // 'income' | 'expense'
  final String? frequency; // 'monthly' | 'weekly'
  final int? dayOfMonth;
  final int? dayOfWeek; // 0=周日 … 6=周六
  final String? startDate; // ISO
  final String? endDate; // ISO | null
  final String? lastGeneratedAt; // ISO | null
  final bool active; // 是否启用（停用后不再自动生成）
  final bool autoCreate; // 是否自动记账（false=仅提醒）
  final String? note;
  final int synced; // 0=待同步 / 1=已同步
  final int? createdAt; // 创建时间戳（ms）；pull 复用本地已有值，避免创建顺序被打乱[R2]

  const RecurringRule({
    required this.id,
    required this.category,
    required this.cents,
    required this.period,
    required this.nextDate,
    required this.greenAmount,
    this.serverId,
    this.target,
    this.ledgerId,
    this.ledgerName,
    this.direction,
    this.frequency,
    this.dayOfMonth,
    this.dayOfWeek,
    this.startDate,
    this.endDate,
    this.lastGeneratedAt,
    this.active = true,
    this.autoCreate = true,
    this.note,
    this.synced = 1,
    this.createdAt,
  });

  factory RecurringRule.fromDb(Map<String, dynamic> m) => RecurringRule(
        id: m['id'] as String,
        category: m['category'] as String,
        cents: m['cents'] as int,
        period: m['period'] as String,
        nextDate: m['next_date'] as String,
        greenAmount: (m['green_amount'] as int? ?? 0) == 1,
        serverId: m['server_id'] as String?,
        target: m['target'] as String?,
        ledgerId: m['ledger_id'] as String?,
        ledgerName: m['ledger_name'] as String?,
        direction: m['direction'] as String?,
        frequency: m['frequency'] as String?,
        dayOfMonth: m['day_of_month'] as int?,
        dayOfWeek: m['day_of_week'] as int?,
        startDate: m['start_date'] as String?,
        endDate: m['end_date'] as String?,
        lastGeneratedAt: m['last_generated_at'] as String?,
        active: (m['active'] as int? ?? 1) == 1,
        autoCreate: (m['auto_create'] as int? ?? 1) == 1,
        note: m['note'] as String?,
        synced: (m['synced'] as int? ?? 1),
        createdAt: m['created_at'] as int?,
      );

  Map<String, dynamic> toDb() => {
        'id': id,
        'category': category,
        'cents': cents,
        'period': period,
        'next_date': nextDate,
        'green_amount': greenAmount ? 1 : 0,
        'server_id': serverId,
        'target': target,
        'ledger_id': ledgerId,
        'ledger_name': ledgerName,
        'direction': direction,
        'frequency': frequency,
        'day_of_month': dayOfMonth,
        'day_of_week': dayOfWeek,
        'start_date': startDate,
        'end_date': endDate,
        'last_generated_at': lastGeneratedAt,
        'active': active ? 1 : 0,
        'auto_create': autoCreate ? 1 : 0,
        'note': note,
        'synced': synced,
        'created_at': createdAt ?? DateTime.now().millisecondsSinceEpoch,
      };

  /// 不可变更新副本（用于本地写路径乐观更新）。
  RecurringRule copyWith({
    String? id,
    String? category,
    int? cents,
    String? period,
    String? nextDate,
    bool? greenAmount,
    String? serverId,
    bool clearServerId = false,
    String? target,
    String? ledgerId,
    String? ledgerName,
    String? direction,
    String? frequency,
    int? dayOfMonth,
    int? dayOfWeek,
    String? startDate,
    String? endDate,
    String? lastGeneratedAt,
    bool? active,
    bool? autoCreate,
    String? note,
    int? synced,
    int? createdAt,
  }) =>
      RecurringRule(
        id: id ?? this.id,
        category: category ?? this.category,
        cents: cents ?? this.cents,
        period: period ?? this.period,
        nextDate: nextDate ?? this.nextDate,
        greenAmount: greenAmount ?? this.greenAmount,
        serverId: clearServerId ? null : (serverId ?? this.serverId),
        target: target ?? this.target,
        ledgerId: ledgerId ?? this.ledgerId,
        ledgerName: ledgerName ?? this.ledgerName,
        direction: direction ?? this.direction,
        frequency: frequency ?? this.frequency,
        dayOfMonth: dayOfMonth ?? this.dayOfMonth,
        dayOfWeek: dayOfWeek ?? this.dayOfWeek,
        startDate: startDate ?? this.startDate,
        endDate: endDate ?? this.endDate,
        lastGeneratedAt: lastGeneratedAt ?? this.lastGeneratedAt,
        active: active ?? this.active,
        autoCreate: autoCreate ?? this.autoCreate,
        note: note ?? this.note,
        synced: synced ?? this.synced,
        createdAt: createdAt ?? this.createdAt,
      );

  /// 从服务端 JSON 构造本地行。
  ///
  /// [localId] 来自本地库已有映射（已同步行复用）或新 UUID（首次拉到）。
  /// 服务端不返 nextDate，展示用 [nextDueDisplay] 客户端推算。
  factory RecurringRule.fromApi(Map<String, dynamic> j,
      {required String localId, int? createdAt}) {
    final direction = j['direction'] as String?;
    final frequency = j['frequency'] as String?;
    final ledger = j['ledger'] as Map<String, dynamic>?;
    return RecurringRule(
      id: localId,
      category: (j['category'] as String?) ?? '',
      cents: (j['amountCents'] as int?) ?? 0,
      period: frequency == 'monthly' ? '每月' : '每周',
      nextDate: '',
      greenAmount: direction == 'income',
      serverId: j['id']?.toString(),
      target: j['target'] as String?,
      ledgerId: j['ledgerId'] as String?,
      ledgerName: ledger?['name'] as String?,
      direction: direction,
      frequency: frequency,
      dayOfMonth: j['dayOfMonth'] as int?,
      dayOfWeek: j['dayOfWeek'] as int?,
      startDate: j['startDate'] as String?,
      endDate: j['endDate'] as String?,
      lastGeneratedAt: j['lastGeneratedAt'] as String?,
      active: (j['active'] as bool?) ?? true,
      autoCreate: (j['autoCreate'] as bool?) ?? true,
      note: j['note'] as String?,
      synced: 1,
      createdAt: createdAt,
    );
  }

  /// 下一次到期日（yyyy-MM-dd）展示串。
  ///
  /// - 本地新建（[serverId]==null）：返回遗留 [nextDate]。
  /// - 已同步：按 [frequency]/[dayOfMonth]/[dayOfWeek]/[startDate]/[lastGeneratedAt] 推算。
  ///   · 月：取 [dayOfMonth] 所在日（超月末取月末）。
  ///   · 周：下一个 [dayOfWeek]（0=周日 … 6=周六）。
  ///   · 若 [lastGeneratedAt] 已 ≥ 推算日则 +1 周期。
  ///   · [startDate] 未到则取 [startDate]。
  String get nextDueDisplay {
    if (serverId == null) return nextDate;
    if (frequency == null) return nextDate;

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    DateTime candidate;

    if (frequency == 'monthly') {
      candidate = _dayOfMonthIn(today, dayOfMonth ?? 1);
    } else if (frequency == 'weekly') {
      candidate = _nextWeekday(today, dayOfWeek ?? 1);
    } else {
      return nextDate;
    }

    // 推算候选日已过期则需后推一个周期：
    // · 有 lastGeneratedAt：以其为准（它 >= 候选日说明已生成过，后推）。
    // · 无 lastGeneratedAt（新建规则从未生成）：候选日若已 < 今天也后推，避免显示历史日期。[R1]
    final bool advance;
    if (lastGeneratedAt != null) {
      final lg = DateTime.tryParse(lastGeneratedAt!);
      if (lg != null) {
        final lgDay = DateTime(lg.year, lg.month, lg.day);
        advance = !lgDay.isBefore(candidate);
      } else {
        advance = candidate.isBefore(today);
      }
    } else {
      advance = candidate.isBefore(today);
    }
    if (advance) {
      candidate = _addCycle(candidate, frequency!);
    }

    // 起始日未到则取起始日。
    if (startDate != null) {
      final sd = DateTime.tryParse(startDate!);
      if (sd != null) {
        final sdDay = DateTime(sd.year, sd.month, sd.day);
        if (sdDay.isAfter(candidate)) candidate = sdDay;
      }
    }

    return '${candidate.year}-${_pad(candidate.month)}-${_pad(candidate.day)}';
  }

  static DateTime _dayOfMonthIn(DateTime base, int dom) {
    final daysInMonth = _daysInMonth(base.year, base.month);
    final day = dom > daysInMonth ? daysInMonth : dom;
    return DateTime(base.year, base.month, day);
  }

  static DateTime _nextWeekday(DateTime base, int weekday) {
    // DateTime.weekday: 1=周一 … 7=周日；转成 0=周日 … 6=周六 比较。
    var d = base;
    while (d.weekday % 7 != weekday) {
      d = d.add(const Duration(days: 1));
    }
    return d;
  }

  static DateTime _addCycle(DateTime d, String frequency) {
    if (frequency == 'monthly') {
      final nextMonth = d.month == 12 ? 1 : d.month + 1;
      final nextYear = d.month == 12 ? d.year + 1 : d.year;
      final dim = _daysInMonth(nextYear, nextMonth);
      final day = d.day > dim ? dim : d.day;
      return DateTime(nextYear, nextMonth, day);
    }
    return d.add(const Duration(days: 7));
  }

  static int _daysInMonth(int year, int month) {
    final next = (month == 12)
        ? DateTime(year + 1, 1, 1)
        : DateTime(year, month + 1, 1);
    return next.subtract(const Duration(days: 1)).day;
  }

  static String _pad(int n) => n.toString().padLeft(2, '0');
}
