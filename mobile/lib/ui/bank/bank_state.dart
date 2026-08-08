import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../../data/local/bank_card_dao.dart';
import '../../data/models/bank_card.dart';

export '../../data/models/bank_card.dart';

/// 银行卡备份页状态（本地持久化到 bank_cards 表）。
class BankState extends ChangeNotifier {
  final List<BankCard> _cards = <BankCard>[];

  List<BankCard> get cards => _cards;

  Future<void> add({
    required String bank,
    required String type,
    required String number,
  }) async {
    final last4 =
        number.length >= 4 ? number.substring(number.length - 4) : number;
    final card = BankCard(
      id: const Uuid().v4(),
      bank: bank,
      type: type,
      last4: last4,
    );
    await BankCardDao().insert(card);
    _cards.add(card);
    notifyListeners();
  }

  Future<void> remove(BankCard c) async {
    await BankCardDao().delete(c.id);
    _cards.removeWhere((e) => e.id == c.id);
    notifyListeners();
  }

  Future<void> load() async {
    final list = await BankCardDao().listAll();
    _cards.clear();
    _cards.addAll(list);
    notifyListeners();
  }
}
