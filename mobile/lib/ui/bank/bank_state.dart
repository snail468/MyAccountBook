import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../../data/local/bank_card_dao.dart';
import '../../data/models/bank_card.dart';
import '../../sync/sync_service.dart';

export '../../data/models/bank_card.dart';

/// 银行卡备份页状态（本地持久化到 bank_cards 表）。
///
/// 离线优先：新增先落本地（serverId=null, synced=0）再入队 POST；
/// 删除已同步卡先入队 DELETE（clientId=serverId，供离线防复活 [D4]）再硬删本地。
class BankState extends ChangeNotifier {
  final List<BankCard> _cards = <BankCard>[];
  final SyncService _sync = SyncService.instance;

  List<BankCard> get cards => _cards;

  Future<void> add({
    required String bank,
    required String type,
    required String number,
    String? alias,
    String? holder,
  }) async {
    final last4 =
        number.length >= 4 ? number.substring(number.length - 4) : number;
    final id = const Uuid().v4();
    final card = BankCard(
      id: id,
      bank: bank,
      type: type,
      last4: last4,
      alias: alias,
      holder: holder,
      serverId: null,
      synced: 0,
    );
    await BankCardDao().insert(card);
    _cards.add(card);
    notifyListeners();

    // 离线优先：入队 POST，联网后由 SyncService.drainQueue 重放到服务端。[D1]
    await _sync.enqueue(
      method: 'POST',
      path: '/cards',
      body: {
        'bankName': bank,
        'alias': alias,
        'cardType': BankCard.localToCardType(type),
        'holder': holder,
        'number': number,
      },
      entity: 'bank_card',
      entityLocalId: id,
    );
  }

  Future<void> remove(BankCard c) async {
    if (c.serverId != null && c.serverId!.isNotEmpty) {
      // 已同步：硬删本地 + 入队 DELETE（clientId 存 serverId 供离线防复活 [D4]）。
      await _sync.enqueue(
        method: 'DELETE',
        path: '/cards/${c.serverId}',
        entity: 'bank_card',
        entityLocalId: c.id,
        clientId: c.serverId,
      );
    } else {
      // 本地新建未推送：服务端无对应行，仅清掉待操作即可。
      await _sync.removePendingFor(c.id);
    }
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
