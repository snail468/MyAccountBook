import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../api/api_client.dart';
import '../api/event_api.dart';
import '../data/local/event_dao.dart';
import '../data/models/taoyuan_event.dart';
import '../data/models/ledger.dart';
import '../sync/sync_service.dart';

const String _kEntity = 'event';

/// 桃源账本：活动列表 + 发布 + 阶段金额。先落本地，再入队。
class TaoyuanState extends ChangeNotifier {
  final EventDao _dao = EventDao();
  final EventApi _api = EventApi(ApiClient.instance);
  final SyncService _sync = SyncService.instance;
  final Ledger ledger;
  TaoyuanState(this.ledger);

  List<TaoyuanEvent> _events = [];
  List<TaoyuanEvent> get events => _events;

  Future<void> load() async {
    _events = await _dao.listByLedger(ledger.id);
    notifyListeners();
  }

  Future<void> addEvent({
    required String title,
    String? content,
    bool participate = true,
    String? reward,
    String? topicTag,
    String? note,
    int? startAt,
    int? deadline,
  }) async {
    final now = DateTime.now();
    final e = TaoyuanEvent(
      id: const Uuid().v4(),
      ledgerId: ledger.id,
      title: title,
      content: content,
      participate: participate,
      reward: reward,
      topicTag: topicTag,
      note: note,
      startAt: startAt,
      deadline: deadline,
      publishedAt: now.millisecondsSinceEpoch,
      status: 'published',
      synced: 0,
      clientId: const Uuid().v4(),
    );
    await _dao.insertEvent(e);
    final body = e.toApiBody();
    body['ledgerId'] = ledger.serverId ?? ledger.id;
    await _sync.enqueue(
      method: 'POST',
      path: '/events',
      body: body,
      clientId: e.clientId,
      entity: _kEntity,
      entityLocalId: e.id,
    );
    await load();
  }

  Future<void> deleteEvent(TaoyuanEvent e) async {
    await _dao.softDeleteEvent(e.id);
    if (e.serverId != null) {
      await _sync.enqueue(
        method: 'DELETE',
        path: '/events/${e.serverId}',
        entity: _kEntity,
        entityLocalId: e.id,
      );
    } else {
      await _sync.removePendingFor(e.id);
    }
    await load();
  }

  /// 新增阶段金额（predicted/announced/paid）。需要活动已同步（有服务端 id）。
  Future<void> addAmount(TaoyuanEvent event, Map<String, dynamic> body) async {
    if (event.serverId == null) {
      throw Exception('请先联网同步该活动后再记金额');
    }
    final a = EventAmount(
      id: const Uuid().v4(),
      eventId: event.id,
      stage: body['stage'] as String? ?? 'predicted',
      cents: body['cents'] as int? ?? 0,
      quantity: body['quantity'] as int?,
      note: body['note'] as String?,
      rewardMethod: body['rewardMethod'] as String?,
      occurredAt: DateTime.now().millisecondsSinceEpoch,
      synced: 0,
    );
    await _dao.insertAmount(a);
    await _sync.enqueue(
      method: 'POST',
      path: '/events/${event.serverId}/amounts',
      body: body,
      entity: 'event_amount',
      entityLocalId: a.id,
    );
    notifyListeners();
  }

  Future<List<EventAmount>> amountsOf(String eventId) =>
      _dao.listAmounts(eventId);
}
