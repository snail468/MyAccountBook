/// 工作账本条目（垫款/回款等，按月归账）。金额单位：分。
class WorkEntry {
  final String id;
  final String ledgerId;
  final String? serverId;
  final String yearMonth; // YYYY-MM
  final String category;
  final String direction; // income | expense
  final int amountCents;
  final String? note;
  final int occurredAt;
  final int? refundedAt;
  final int? deletedAt;
  final int synced;
  final String? clientId;

  WorkEntry({
    required this.id,
    required this.ledgerId,
    this.serverId,
    required this.yearMonth,
    required this.category,
    required this.direction,
    required this.amountCents,
    this.note,
    required this.occurredAt,
    this.refundedAt,
    this.deletedAt,
    this.synced = 0,
    this.clientId,
  });

  factory WorkEntry.fromDb(Map<String, dynamic> m) => WorkEntry(
        id: m['id'] as String,
        ledgerId: m['ledger_id'] as String,
        serverId: m['server_id'] as String?,
        yearMonth: m['year_month'] as String,
        category: m['category'] as String,
        direction: m['direction'] as String,
        amountCents: m['amount_cents'] as int,
        note: m['note'] as String?,
        occurredAt: m['occurred_at'] as int,
        refundedAt: m['refunded_at'] as int?,
        deletedAt: m['deleted_at'] as int?,
        synced: m['synced'] as int? ?? 0,
        clientId: m['client_id'] as String?,
      );

  Map<String, dynamic> toDb() => {
        'id': id,
        'ledger_id': ledgerId,
        'server_id': serverId,
        'year_month': yearMonth,
        'category': category,
        'direction': direction,
        'amount_cents': amountCents,
        'note': note,
        'occurred_at': occurredAt,
        'refunded_at': refundedAt,
        'deleted_at': deletedAt,
        'synced': synced,
        'client_id': clientId,
      };

  Map<String, dynamic> toApiBody({bool withClientId = true}) => {
        'yearMonth': yearMonth,
        'category': category,
        'direction': direction,
        'amountCents': amountCents,
        'note': note,
        'occurredAt': DateTime.fromMillisecondsSinceEpoch(occurredAt)
            .toUtc()
            .toIso8601String(),
        'ledgerId': ledgerId,
        if (withClientId && clientId != null) 'clientId': clientId,
      };

  factory WorkEntry.fromApi(Map<String, dynamic> j, String ledgerId,
      {String? localId}) {
    final occurred =
        j['occurredAt'] is String ? DateTime.tryParse(j['occurredAt']) : null;
    final refunded =
        j['refundedAt'] is String ? DateTime.tryParse(j['refundedAt']) : null;
    final deleted =
        j['deletedAt'] is String ? DateTime.tryParse(j['deletedAt']) : null;
    return WorkEntry(
      id: localId ?? (j['id'] as String),
      serverId: j['id'] as String,
      ledgerId: ledgerId,
      yearMonth: j['yearMonth'] as String,
      category: j['category'] as String,
      direction: j['direction'] as String,
      amountCents: j['amountCents'] as int,
      note: j['note'] as String?,
      occurredAt:
          occurred?.millisecondsSinceEpoch ?? DateTime.now().millisecondsSinceEpoch,
      refundedAt: refunded?.millisecondsSinceEpoch,
      deletedAt: deleted?.millisecondsSinceEpoch,
      synced: 1,
    );
  }
}
