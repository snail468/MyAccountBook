/// 银行卡（本地持久化；仅存后四位，完整卡号不落库）。
class BankCard {
  final String id; // 本地 id
  final String bank;
  final String type;
  final String last4;

  const BankCard({
    required this.id,
    required this.bank,
    required this.type,
    required this.last4,
  });

  factory BankCard.fromDb(Map<String, dynamic> m) => BankCard(
        id: m['id'] as String,
        bank: m['bank'] as String,
        type: m['type'] as String,
        last4: m['last4'] as String,
      );

  Map<String, dynamic> toDb() => {
        'id': id,
        'bank': bank,
        'type': type,
        'last4': last4,
        'created_at': DateTime.now().millisecondsSinceEpoch,
      };
}
