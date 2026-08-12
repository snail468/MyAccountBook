/// 账本容器（覆盖 work / taoyuan / general / travel 四种）。
class Ledger {
  final String id; // 本地 UUID；从服务端拉取时为服务端 cuid
  final String? serverId;
  final String kind;
  final String name;
  final String? icon;
  final String? color;
  final int order;
  final bool archived;
  final int? deletedAt;
  final int? budgetCents;
  final String? customCategories;
  final String? baseCurrency;
  final int? startDate;
  final int? endDate;
  final String? tripBudget;
  final int synced;
  // 协同共享：服务端标记当前用户是否为 owner，以及 owner 用户名（用于前缀显示）。
  final bool? isOwn;
  final String? ownerName;
  // 增量同步水线：上次成功拉取该账本条目变更的时间戳（epoch ms）。null = 尚未拉过。
  final int? lastPullAt;

  Ledger({
    required this.id,
    this.serverId,
    required this.kind,
    required this.name,
    this.icon,
    this.color,
    this.order = 0,
    this.archived = false,
    this.deletedAt,
    this.budgetCents,
    this.customCategories,
    this.baseCurrency,
    this.startDate,
    this.endDate,
    this.tripBudget,
    this.synced = 1,
    this.isOwn,
    this.ownerName,
    this.lastPullAt,
  });

  factory Ledger.fromDb(Map<String, dynamic> m) => Ledger(
        id: m['id'] as String,
        serverId: m['server_id'] as String?,
        kind: m['kind'] as String,
        name: m['name'] as String,
        icon: m['icon'] as String?,
        color: m['color'] as String?,
        order: m['sort_order'] as int? ?? 0,
        archived: (m['archived'] as int? ?? 0) == 1,
        deletedAt: m['deleted_at'] as int?,
        budgetCents: m['budget_cents'] as int?,
        customCategories: m['custom_categories'] as String?,
        baseCurrency: m['base_currency'] as String?,
        startDate: m['start_date'] as int?,
        endDate: m['end_date'] as int?,
        tripBudget: m['trip_budget'] as String?,
        synced: m['synced'] as int? ?? 1,
        isOwn: (m['is_own'] as int? ?? 0) == 1 ? true : (m['is_own'] == null ? null : false),
        ownerName: m['owner_name'] as String?,
        lastPullAt: m['last_pull_at'] as int?,
      );

  Map<String, dynamic> toDb() => {
        'id': id,
        'server_id': serverId,
        'kind': kind,
        'name': name,
        'icon': icon,
        'color': color,
        'sort_order': order,
        'archived': archived ? 1 : 0,
        'deleted_at': deletedAt,
        'budget_cents': budgetCents,
        'custom_categories': customCategories,
        'base_currency': baseCurrency,
        'start_date': startDate,
        'end_date': endDate,
        'trip_budget': tripBudget,
        'synced': synced,
        'is_own': isOwn == true ? 1 : 0,
        'owner_name': ownerName,
        'last_pull_at': lastPullAt,
      };

  /// 从服务端 JSON 构造（拉取同步时用）。
  factory Ledger.fromApi(Map<String, dynamic> j, {String? localId}) => Ledger(
        id: localId ?? (j['id'] as String),
        serverId: j['id'] as String,
        kind: j['kind'] as String,
        name: j['name'] as String,
        icon: j['icon'] as String?,
        color: j['color'] as String?,
        order: j['order'] as int? ?? 0,
        archived: j['archived'] as bool? ?? false,
        deletedAt: _toMillis(j['deletedAt']),
        budgetCents: j['budgetCents'] as int?,
        customCategories: j['customCategories'] as String?,
        baseCurrency: j['baseCurrency'] as String?,
        startDate: _toMillis(j['startDate']),
        endDate: _toMillis(j['endDate']),
        tripBudget: j['tripBudget'] as String?,
        synced: 1,
        isOwn: j['isOwn'] as bool?,
        ownerName: j['ownerName'] as String?,
      );

  static int? _toMillis(dynamic v) {
    if (v == null) return null;
    if (v is int) return v;
    if (v is String) {
      final d = DateTime.tryParse(v);
      return d?.millisecondsSinceEpoch;
    }
    return null;
  }

  /// 不可变更新副本（账本管理页软删除/恢复时用）。
  Ledger copyWith({
    String? id,
    String? serverId,
    String? kind,
    String? name,
    String? icon,
    String? color,
    int? order,
    bool? archived,
    int? deletedAt,
    int? budgetCents,
    String? customCategories,
    String? baseCurrency,
    int? startDate,
    int? endDate,
    String? tripBudget,
    int? synced,
    bool? isOwn,
    String? ownerName,
    int? lastPullAt,
  }) =>
      Ledger(
        id: id ?? this.id,
        serverId: serverId ?? this.serverId,
        kind: kind ?? this.kind,
        name: name ?? this.name,
        icon: icon ?? this.icon,
        color: color ?? this.color,
        order: order ?? this.order,
        archived: archived ?? this.archived,
        deletedAt: deletedAt ?? this.deletedAt,
        budgetCents: budgetCents ?? this.budgetCents,
        customCategories: customCategories ?? this.customCategories,
        baseCurrency: baseCurrency ?? this.baseCurrency,
        startDate: startDate ?? this.startDate,
        endDate: endDate ?? this.endDate,
        tripBudget: tripBudget ?? this.tripBudget,
        synced: synced ?? this.synced,
        isOwn: isOwn ?? this.isOwn,
        ownerName: ownerName ?? this.ownerName,
        lastPullAt: lastPullAt ?? this.lastPullAt,
      );

  /// 协同共享账本显示名：他人所有（且服务端带回 ownerName）时加「owner · 」前缀。
  /// 本地自建或未同步（ownerName 为空）账本不加前缀，避免误标。
  String get displayName =>
      (ownerName != null && isOwn != true) ? '$ownerName · $name' : name;
}
