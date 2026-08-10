/// 银行卡（本地持久化；仅存后四位，完整卡号不落库）。
///
/// 离线优先 + 服务端对账：新增 `serverId`/`alias`/`holder`/`synced` 四列，
/// 用于登录后从 [CardApi] 拉取并双向同步（同 v2.0.30 的 server_id 复用模式）。
class BankCard {
  final String id; // 本地 id（永远本地 UUID）
  final String bank;
  final String type; // 中文：储蓄卡 / 信用卡
  final String last4;
  final String? serverId; // 服务端 cuid（同步前为 null）
  final String? alias; // 卡片别名（服务端明文）
  final String? holder; // 持卡人（服务端明文）
  final int synced; // 0=待同步 / 1=已同步
  final int? createdAt; // 创建时间戳（ms）；pull 复用本地已有值，避免创建顺序被打乱[R2]

  const BankCard({
    required this.id,
    required this.bank,
    required this.type,
    required this.last4,
    this.serverId,
    this.alias,
    this.holder,
    this.synced = 1,
    this.createdAt,
  });

  factory BankCard.fromDb(Map<String, dynamic> m) => BankCard(
        id: m['id'] as String,
        bank: m['bank'] as String,
        type: m['type'] as String,
        last4: m['last4'] as String,
        serverId: m['server_id'] as String?,
        alias: m['alias'] as String?,
        holder: m['holder'] as String?,
        synced: (m['synced'] as int? ?? 1),
        createdAt: m['created_at'] as int?,
      );

  Map<String, dynamic> toDb() => {
        'id': id,
        'bank': bank,
        'type': type,
        'last4': last4,
        'server_id': serverId,
        'alias': alias,
        'holder': holder,
        'synced': synced,
        'created_at': createdAt ?? DateTime.now().millisecondsSinceEpoch,
      };

  /// 不可变更新副本（用于本地写路径乐观更新）。
  BankCard copyWith({
    String? id,
    String? bank,
    String? type,
    String? last4,
    String? serverId,
    bool clearServerId = false,
    String? alias,
    String? holder,
    int? synced,
    int? createdAt,
  }) =>
      BankCard(
        id: id ?? this.id,
        bank: bank ?? this.bank,
        type: type ?? this.type,
        last4: last4 ?? this.last4,
        serverId: clearServerId ? null : (serverId ?? this.serverId),
        alias: alias ?? this.alias,
        holder: holder ?? this.holder,
        synced: synced ?? this.synced,
        createdAt: createdAt ?? this.createdAt,
      );

  /// 服务端 cardType('debit'|'credit') -> 本地中文（pull 用）。
  static String cardTypeToLocal(String? cardType) =>
      cardType == 'credit' ? '信用卡' : '储蓄卡';

  /// 本地中文 -> 服务端 cardType（push POST 用；本期 POST 不实际调用，预留）。
  static String localToCardType(String type) =>
      type == '信用卡' ? 'credit' : 'debit';

  /// 从服务端 JSON 构造本地行。
  ///
  /// [localId] 来自本地库已有映射（已同步行复用）或新 UUID（首次拉到）。
  /// 仅消费未解锁路径的明文/尾号字段（[D2] 不调 unlock、不显完整卡号）。
  factory BankCard.fromApi(Map<String, dynamic> j,
      {required String localId, int? createdAt}) {
    final rawLast4 = j['last4'];
    final rawBank = j['bankName'];
    return BankCard(
      id: localId,
      bank: rawBank?.toString() ?? '',
      type: BankCard.cardTypeToLocal(j['cardType'] as String?),
      last4: rawLast4?.toString() ?? '',
      serverId: j['id']?.toString(),
      alias: j['alias']?.toString(),
      holder: j['holder']?.toString(),
      synced: 1,
      createdAt: createdAt,
    );
  }
}
