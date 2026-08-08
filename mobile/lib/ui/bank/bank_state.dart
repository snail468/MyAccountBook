import 'package:flutter/foundation.dart';

/// 银行卡（内存态，仅本地展示，无后端持久化）。
class BankCard {
  final String bank;
  final String type;
  final String last4;

  const BankCard({
    required this.bank,
    required this.type,
    required this.last4,
  });
}

/// 银行卡备份页状态（in-memory，无后端，数据仅存于本次会话）。
class BankState extends ChangeNotifier {
  final List<BankCard> _cards = <BankCard>[];

  List<BankCard> get cards => _cards;

  void add({
    required String bank,
    required String type,
    required String number,
  }) {
    final last4 =
        number.length >= 4 ? number.substring(number.length - 4) : number;
    _cards.add(BankCard(bank: bank, type: type, last4: last4));
    notifyListeners();
  }

  void remove(BankCard c) {
    _cards.remove(c);
    notifyListeners();
  }

  Future<void> load() async {
    notifyListeners();
  }
}
