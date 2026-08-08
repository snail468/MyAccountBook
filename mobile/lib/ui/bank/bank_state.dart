import 'package:flutter/foundation.dart';

/// 银行卡（demo，内存态）。
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

/// 银行卡备份页状态（in-memory demo）。
class BankState extends ChangeNotifier {
  final List<BankCard> _cards = [
    const BankCard(bank: '招商银行', type: '储蓄卡', last4: '1234'),
    const BankCard(bank: '工商银行', type: '信用卡', last4: '5678'),
    const BankCard(bank: '建设银行', type: '信用卡', last4: '9012'),
  ];

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
