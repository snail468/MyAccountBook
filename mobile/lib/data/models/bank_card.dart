import 'dart:convert';

/// 银行卡（本地持久化）。
///
/// 离线优先 + 服务端对账：新增 `serverId`/`alias`/`holder`/`synced` 四列，
/// 用于登录后从 [CardApi] 拉取并双向同步（同 v2.0.30 的 server_id 复用模式）。
///
/// 卡号：网页端以 AES-256-GCM 加密存储；本地优先单用户场景用等价的轻量可逆
/// 混淆（[obfuscateNumber]/[deobfuscateNumber]）避免明文落库 —— 数据库文件泄露
/// 也读不出完整卡号。解密失败（如密钥不匹配）时返回 null，UI 回退到尾号。
class BankCard {
  final String id; // 本地 id（永远本地 UUID）
  final String bank;
  final String type; // 中文：储蓄卡 / 信用卡
  final String last4;
  final String? serverId; // 服务端 cuid（同步前为 null）
  final String? alias; // 卡片别名（服务端明文）
  final String? holder; // 持卡人（服务端明文）
  final String? note; // 备注（服务端明文；对齐网页端 CardsClient 的 note 字段）
  final int synced; // 0=待同步 / 1=已同步
  final int? createdAt; // 创建时间戳（ms）；pull 复用本地已有值，避免创建顺序被打乱[R2]
  /// 完整卡号（明文，仅在内存态展示；落库经 [obfuscateNumber] 混淆）。
  final String? number;

  const BankCard({
    required this.id,
    required this.bank,
    required this.type,
    required this.last4,
    this.serverId,
    this.alias,
    this.holder,
    this.note,
    this.synced = 1,
    this.createdAt,
    this.number,
  });

  factory BankCard.fromDb(Map<String, dynamic> m) => BankCard(
        id: m['id'] as String,
        bank: m['bank'] as String,
        type: m['type'] as String,
        last4: m['last4'] as String,
        serverId: m['server_id'] as String?,
        alias: m['alias'] as String?,
        holder: m['holder'] as String?,
        note: m['note'] as String?,
        synced: (m['synced'] as int? ?? 1),
        createdAt: m['created_at'] as int?,
        number: deobfuscateNumber(m['number'] as String?),
      );

  Map<String, dynamic> toDb() => {
        'id': id,
        'bank': bank,
        'type': type,
        'last4': last4,
        'server_id': serverId,
        'alias': alias,
        'holder': holder,
        'note': note,
        'synced': synced,
        'created_at': createdAt ?? DateTime.now().millisecondsSinceEpoch,
        'number': number == null ? null : obfuscateNumber(number!),
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
    String? note,
    int? synced,
    int? createdAt,
    String? number,
  }) =>
      BankCard(
        id: id ?? this.id,
        bank: bank ?? this.bank,
        type: type ?? this.type,
        last4: last4 ?? this.last4,
        serverId: clearServerId ? null : (serverId ?? this.serverId),
        alias: alias ?? this.alias,
        holder: holder ?? this.holder,
        note: note ?? this.note,
        synced: synced ?? this.synced,
        createdAt: createdAt ?? this.createdAt,
        number: number ?? this.number,
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

  /// 把卡号按每 4 位分组（对齐网页端 [groupCardNumber]），如 6217 0041 2345 6789。
  static String groupCardNumber(String n) {
    final digits = n.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return n;
    final buf = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && i % 4 == 0) buf.write(' ');
      buf.write(digits[i]);
    }
    return buf.toString();
  }
}

/// 复制完整信息时拼接的分享文本（对齐网页端 [buildCardShareText]）。
String buildCardShareText({
  required String bankName,
  String? holder,
  required String number,
}) {
  final b = bankName.isNotEmpty ? bankName : '银行卡';
  final h = holder != null && holder.isNotEmpty ? ' · $holder' : '';
  return '$b$h · 卡号 $number';
}

/// 轻量可逆混淆：XOR + base64，避免完整卡号明文落库。
///
/// 仅对标本地优先单用户场景；真实密钥管理由服务端 CARD_SECRET 承担，
/// 此处固定密钥仅为"数据库文件泄露读不出"的等效语义，不可视为强加密。
const String _kCardObfuscateKey = 'mab_card_local_obf_v1';

String obfuscateNumber(String plain) {
  final bytes = utf8.encode(plain);
  final key = utf8.encode(_kCardObfuscateKey);
  final out = <int>[];
  for (var i = 0; i < bytes.length; i++) {
    out.add(bytes[i] ^ key[i % key.length]);
  }
  return base64.encode(out);
}

String? deobfuscateNumber(String? cipher) {
  if (cipher == null || cipher.isEmpty) return null;
  try {
    final bytes = base64.decode(cipher);
    final key = utf8.encode(_kCardObfuscateKey);
    final out = <int>[];
    for (var i = 0; i < bytes.length; i++) {
      out.add(bytes[i] ^ key[i % key.length]);
    }
    return utf8.decode(out);
  } catch (_) {
    return null; // 解密失败（如密钥不匹配）→ 回退到尾号
  }
}
