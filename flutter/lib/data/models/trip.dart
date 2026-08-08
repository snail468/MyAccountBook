import 'dart:convert';

/// 旅游账本：成员（可为纯名字占位，也可关联应用内用户）。
class TripMember {
  final String id;
  final String ledgerId;
  final String? serverId;
  final String? userId;
  final String displayName;
  final bool settled;
  final int synced;

  TripMember({
    required this.id,
    required this.ledgerId,
    this.serverId,
    this.userId,
    required this.displayName,
    this.settled = false,
    this.synced = 0,
  });

  factory TripMember.fromDb(Map<String, dynamic> m) => TripMember(
        id: m['id'] as String,
        ledgerId: m['ledger_id'] as String,
        serverId: m['server_id'] as String?,
        userId: m['user_id'] as String?,
        displayName: m['display_name'] as String,
        settled: (m['settled'] as int? ?? 0) == 1,
        synced: m['synced'] as int? ?? 0,
      );

  Map<String, dynamic> toDb() => {
        'id': id,
        'ledger_id': ledgerId,
        'server_id': serverId,
        'user_id': userId,
        'display_name': displayName,
        'settled': settled ? 1 : 0,
        'synced': synced,
      };
}

/// 旅游账本：一笔花费（多币种，记录原币与本币）。
class TripExpense {
  final String id;
  final String ledgerId;
  final String? serverId;
  final String payerId; // TripMember.id
  final String title;
  final String category;
  final String phase; // pre | during
  final String currency;
  final int amountForeignCents;
  final double rate; // 1 外币 = rate 本币
  final int amountBaseCents;
  final String? note;
  final List<String> imageUrls;
  final int occurredAt;
  final int? deletedAt;
  final int synced;
  final String? clientId;

  TripExpense({
    required this.id,
    required this.ledgerId,
    this.serverId,
    required this.payerId,
    required this.title,
    required this.category,
    required this.phase,
    required this.currency,
    required this.amountForeignCents,
    required this.rate,
    required this.amountBaseCents,
    this.note,
    this.imageUrls = const [],
    required this.occurredAt,
    this.deletedAt,
    this.synced = 0,
    this.clientId,
  });

  factory TripExpense.fromDb(Map<String, dynamic> m) => TripExpense(
        id: m['id'] as String,
        ledgerId: m['ledger_id'] as String,
        serverId: m['server_id'] as String?,
        payerId: m['payer_id'] as String,
        title: m['title'] as String,
        category: m['category'] as String,
        phase: m['phase'] as String,
        currency: m['currency'] as String,
        amountForeignCents: m['amount_foreign_cents'] as int,
        rate: (m['rate'] as num?)?.toDouble() ?? 1.0,
        amountBaseCents: m['amount_base_cents'] as int,
        note: m['note'] as String?,
        imageUrls: _decodeImages(m['image_urls']),
        occurredAt: m['occurred_at'] as int,
        deletedAt: m['deleted_at'] as int?,
        synced: m['synced'] as int? ?? 0,
        clientId: m['client_id'] as String?,
      );

  Map<String, dynamic> toDb() => {
        'id': id,
        'ledger_id': ledgerId,
        'server_id': serverId,
        'payer_id': payerId,
        'title': title,
        'category': category,
        'phase': phase,
        'currency': currency,
        'amount_foreign_cents': amountForeignCents,
        'rate': rate,
        'amount_base_cents': amountBaseCents,
        'note': note,
        'image_urls': jsonEncode(imageUrls),
        'occurred_at': occurredAt,
        'deleted_at': deletedAt,
        'synced': synced,
        'client_id': clientId,
      };

  Map<String, dynamic> toApiBody({bool withClientId = true}) => {
        'payerId': payerId,
        'title': title,
        'category': category,
        'phase': phase,
        'currency': currency,
        'amountForeignCents': amountForeignCents,
        'rate': rate,
        'amountBaseCents': amountBaseCents,
        'note': note,
        'imageUrls': imageUrls,
        'occurredAt': DateTime.fromMillisecondsSinceEpoch(occurredAt)
            .toUtc()
            .toIso8601String(),
        if (withClientId && clientId != null) 'clientId': clientId,
      };

  static List<String> _decodeImages(dynamic v) {
    if (v == null) return const [];
    if (v is String && v.isNotEmpty) {
      try {
        final decoded = jsonDecode(v);
        if (decoded is List) return decoded.map((e) => e.toString()).toList();
      } catch (_) {
        return const [];
      }
    }
    return const [];
  }
}

/// 旅游账本：一笔花费的分摊（某成员承担多少本币）。
class TripSplit {
  final String id;
  final String expenseId;
  final String? serverId;
  final String memberId; // TripMember.id
  final int shareCents;

  TripSplit({
    required this.id,
    required this.expenseId,
    this.serverId,
    required this.memberId,
    required this.shareCents,
  });

  factory TripSplit.fromDb(Map<String, dynamic> m) => TripSplit(
        id: m['id'] as String,
        expenseId: m['expense_id'] as String,
        serverId: m['server_id'] as String?,
        memberId: m['member_id'] as String,
        shareCents: m['share_cents'] as int,
      );

  Map<String, dynamic> toDb() => {
        'id': id,
        'expense_id': expenseId,
        'server_id': serverId,
        'member_id': memberId,
        'share_cents': shareCents,
      };
}

TripMember tripMemberFromApi(Map<String, dynamic> j, String ledgerId,
    {String? localId}) {
  return TripMember(
    id: localId ?? (j['id'] as String),
    serverId: j['id'] as String,
    ledgerId: ledgerId,
    userId: j['userId'] as String?,
    displayName: j['displayName'] as String,
    settled: j['settled'] as bool? ?? false,
    synced: 1,
  );
}

TripExpense tripExpenseFromApi(Map<String, dynamic> j, String ledgerId,
    {String? localId}) {
  final occurred =
      j['occurredAt'] is String ? DateTime.tryParse(j['occurredAt']) : null;
  final imgs = j['imageUrls'];
  return TripExpense(
    id: localId ?? (j['id'] as String),
    serverId: j['id'] as String,
    ledgerId: ledgerId,
    payerId: j['payerId'] as String,
    title: j['title'] as String,
    category: j['category'] as String,
    phase: j['phase'] as String,
    currency: j['currency'] as String,
    amountForeignCents: j['amountForeignCents'] as int,
    rate: (j['rate'] as num?)?.toDouble() ?? 1.0,
    amountBaseCents: j['amountBaseCents'] as int,
    note: j['note'] as String?,
    imageUrls: imgs is List ? imgs.map((e) => e.toString()).toList() : const [],
    occurredAt:
        occurred?.millisecondsSinceEpoch ?? DateTime.now().millisecondsSinceEpoch,
    synced: 1,
  );
}

TripSplit tripSplitFromApi(Map<String, dynamic> j, String expenseId,
    {String? localId}) {
  return TripSplit(
    id: localId ?? (j['id'] as String),
    serverId: j['id'] as String,
    expenseId: expenseId,
    memberId: j['memberId'] as String,
    shareCents: j['shareCents'] as int,
  );
}
