import 'dart:convert';
/// 普通账本条目（日常收支）。金额单位：分。
class GeneralEntry {
  final String id; // 本地 UUID
  final String ledgerId;
  final String? serverId;
  final String direction; // income | expense
  final String category;
  final int amountCents;
  final String? tags; // 逗号分隔
  final String? note;
  final List<String> imageUrls;
  final int occurredAt; // epoch millis
  final int? deletedAt;
  final int synced;
  final String? clientId;

  GeneralEntry({
    required this.id,
    required this.ledgerId,
    this.serverId,
    required this.direction,
    required this.category,
    required this.amountCents,
    this.tags,
    this.note,
    this.imageUrls = const [],
    required this.occurredAt,
    this.deletedAt,
    this.synced = 0,
    this.clientId,
  });

  factory GeneralEntry.fromDb(Map<String, dynamic> m) => GeneralEntry(
        id: m['id'] as String,
        ledgerId: m['ledger_id'] as String,
        serverId: m['server_id'] as String?,
        direction: m['direction'] as String,
        category: m['category'] as String,
        amountCents: m['amount_cents'] as int,
        tags: m['tags'] as String?,
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
        'direction': direction,
        'category': category,
        'amount_cents': amountCents,
        'tags': tags,
        'note': note,
        'image_urls': _encodeImages(imageUrls),
        'occurred_at': occurredAt,
        'deleted_at': deletedAt,
        'synced': synced,
        'client_id': clientId,
      };

  /// 提交到服务端的请求体（含 clientId 用于幂等）。
  Map<String, dynamic> toApiBody({bool withClientId = true}) => {
        'direction': direction,
        'category': category,
        'amountCents': amountCents,
        'tags': tags,
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
        if (decoded is List) {
          return decoded.map((e) => e.toString()).toList();
        }
      } catch (_) {
        return const [];
      }
    }
    return const [];
  }

  static String _encodeImages(List<String> urls) => jsonEncode(urls);

  /// 从服务端 JSON 构造（拉取同步时用）。
  factory GeneralEntry.fromApi(Map<String, dynamic> j, String ledgerId,
      {String? localId}) {
    final occurred =
        j['occurredAt'] is String ? DateTime.tryParse(j['occurredAt']) : null;
    final imgs = j['imageUrls'];
    final deleted =
        j['deletedAt'] is String ? DateTime.tryParse(j['deletedAt']) : null;
    return GeneralEntry(
      id: localId ?? (j['id'] as String),
      serverId: j['id'] as String,
      ledgerId: ledgerId,
      direction: j['direction'] as String,
      category: j['category'] as String,
      amountCents: j['amountCents'] as int,
      tags: j['tags'] as String?,
      note: j['note'] as String?,
      imageUrls: imgs is List ? imgs.map((e) => e.toString()).toList() : const [],
      occurredAt:
          occurred?.millisecondsSinceEpoch ?? DateTime.now().millisecondsSinceEpoch,
      deletedAt: deleted?.millisecondsSinceEpoch,
      synced: 1,
    );
  }
}
