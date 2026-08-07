/// 桃源账本：活动（Event）。rewardMethods/reward/contentImages 等 JSON 字段
/// 在本地以原始字符串/json 存储，展示时解析。
class TaoyuanEvent {
  final String id;
  final String ledgerId;
  final String? serverId;
  final String title;
  final int? startAt;
  final String? content;
  final String? rewardMethod;
  final String? rewardMethods;
  final String? reward;
  final String? topicTag;
  final String? contentImages;
  final int publishedAt;
  final bool participate;
  final int? deadline;
  final int? predictedCents;
  final int? announcedCents;
  final int? paidCents;
  final int? predictedAt;
  final int? announcedAt;
  final int? paidAt;
  final String status;
  final String? note;
  final String? parentId;
  final int? deletedAt;
  final int synced;
  final String? clientId;

  TaoyuanEvent({
    required this.id,
    required this.ledgerId,
    this.serverId,
    required this.title,
    this.startAt,
    this.content,
    this.rewardMethod,
    this.rewardMethods,
    this.reward,
    this.topicTag,
    this.contentImages,
    required this.publishedAt,
    this.participate = true,
    this.deadline,
    this.predictedCents,
    this.announcedCents,
    this.paidCents,
    this.predictedAt,
    this.announcedAt,
    this.paidAt,
    this.status = 'published',
    this.note,
    this.parentId,
    this.deletedAt,
    this.synced = 0,
    this.clientId,
  });

  factory TaoyuanEvent.fromDb(Map<String, dynamic> m) => TaoyuanEvent(
        id: m['id'] as String,
        ledgerId: m['ledger_id'] as String,
        serverId: m['server_id'] as String?,
        title: m['title'] as String,
        startAt: m['start_at'] as int?,
        content: m['content'] as String?,
        rewardMethod: m['reward_method'] as String?,
        rewardMethods: m['reward_methods'] as String?,
        reward: m['reward'] as String?,
        topicTag: m['topic_tag'] as String?,
        contentImages: m['content_images'] as String?,
        publishedAt: m['published_at'] as int,
        participate: (m['participate'] as int? ?? 1) == 1,
        deadline: m['deadline'] as int?,
        predictedCents: m['predicted_cents'] as int?,
        announcedCents: m['announced_cents'] as int?,
        paidCents: m['paid_cents'] as int?,
        predictedAt: m['predicted_at'] as int?,
        announcedAt: m['announced_at'] as int?,
        paidAt: m['paid_at'] as int?,
        status: m['status'] as String? ?? 'published',
        note: m['note'] as String?,
        parentId: m['parent_id'] as String?,
        deletedAt: m['deleted_at'] as int?,
        synced: m['synced'] as int? ?? 0,
        clientId: m['client_id'] as String?,
      );

  Map<String, dynamic> toDb() => {
        'id': id,
        'ledger_id': ledgerId,
        'server_id': serverId,
        'title': title,
        'start_at': startAt,
        'content': content,
        'reward_method': rewardMethod,
        'reward_methods': rewardMethods,
        'reward': reward,
        'topic_tag': topicTag,
        'content_images': contentImages,
        'published_at': publishedAt,
        'participate': participate ? 1 : 0,
        'deadline': deadline,
        'predicted_cents': predictedCents,
        'announced_cents': announcedCents,
        'paid_cents': paidCents,
        'predicted_at': predictedAt,
        'announced_at': announcedAt,
        'paid_at': paidAt,
        'status': status,
        'note': note,
        'parent_id': parentId,
        'deleted_at': deletedAt,
        'synced': synced,
        'client_id': clientId,
      };

  Map<String, dynamic> toApiBody() => {
        'ledgerId': ledgerId,
        'title': title,
        'startAt': startAt != null
            ? DateTime.fromMillisecondsSinceEpoch(startAt!)
                .toUtc()
                .toIso8601String()
            : null,
        'content': content,
        'rewardMethod': rewardMethod,
        'rewardMethods': rewardMethods,
        'reward': reward,
        'topicTag': topicTag,
        'contentImages': contentImages,
        'participate': participate,
        'deadline': deadline != null
            ? DateTime.fromMillisecondsSinceEpoch(deadline!)
                .toUtc()
                .toIso8601String()
            : null,
        'predictedCents': predictedCents,
        'announcedCents': announcedCents,
        'paidCents': paidCents,
        'status': status,
        'note': note,
        'parentId': parentId,
        'clientId': clientId,
      };

  /// 从服务端 JSON 构造（拉取同步时用）。
  factory TaoyuanEvent.fromApi(Map<String, dynamic> j, String ledgerId,
      {String? localId}) {
    final iso = (v) {
      if (v is String) return DateTime.tryParse(v)?.millisecondsSinceEpoch;
      return null;
    };
    return TaoyuanEvent(
      id: localId ?? (j['id'] as String),
      serverId: j['id'] as String,
      ledgerId: ledgerId,
      title: j['title'] as String,
      startAt: iso(j['startAt']) as int?,
      content: j['content'] as String?,
      rewardMethod: j['rewardMethod'] as String?,
      rewardMethods: j['rewardMethods'] as String?,
      reward: j['reward'] as String?,
      topicTag: j['topicTag'] as String?,
      contentImages: j['contentImages'] as String?,
      publishedAt: iso(j['publishedAt']) as int? ??
          DateTime.now().millisecondsSinceEpoch,
      participate: j['participate'] as bool? ?? true,
      deadline: iso(j['deadline']) as int?,
      predictedCents: j['predictedCents'] as int?,
      announcedCents: j['announcedCents'] as int?,
      paidCents: j['paidCents'] as int?,
      predictedAt: iso(j['predictedAt']) as int?,
      announcedAt: iso(j['announcedAt']) as int?,
      paidAt: iso(j['paidAt']) as int?,
      status: j['status'] as String? ?? 'published',
      note: j['note'] as String?,
      parentId: j['parentId'] as String?,
      deletedAt: iso(j['deletedAt']) as int?,
      synced: 1,
    );
  }
}

/// 桃源账本：活动金额（分阶段：预测/公示/到账）。
class EventAmount {
  final String id;
  final String eventId;
  final String? serverId;
  final String stage; // predicted | announced | paid
  final int cents;
  final int? quantity;
  final String? itemDesc;
  final String? note;
  final String? rewardMethod;
  final int occurredAt;
  final int? deletedAt;
  final int synced;

  EventAmount({
    required this.id,
    required this.eventId,
    this.serverId,
    required this.stage,
    required this.cents,
    this.quantity,
    this.itemDesc,
    this.note,
    this.rewardMethod,
    required this.occurredAt,
    this.deletedAt,
    this.synced = 0,
  });

  factory EventAmount.fromDb(Map<String, dynamic> m) => EventAmount(
        id: m['id'] as String,
        eventId: m['event_id'] as String,
        serverId: m['server_id'] as String?,
        stage: m['stage'] as String,
        cents: m['cents'] as int,
        quantity: m['quantity'] as int?,
        itemDesc: m['item_desc'] as String?,
        note: m['note'] as String?,
        rewardMethod: m['reward_method'] as String?,
        occurredAt: m['occurred_at'] as int,
        deletedAt: m['deleted_at'] as int?,
        synced: m['synced'] as int? ?? 0,
      );

  Map<String, dynamic> toDb() => {
        'id': id,
        'event_id': eventId,
        'server_id': serverId,
        'stage': stage,
        'cents': cents,
        'quantity': quantity,
        'item_desc': itemDesc,
        'note': note,
        'reward_method': rewardMethod,
        'occurred_at': occurredAt,
        'deleted_at': deletedAt,
        'synced': synced,
      };

  factory EventAmount.fromApi(Map<String, dynamic> j, String eventId,
      {String? localId}) {
    final occurred =
        j['occurredAt'] is String ? DateTime.tryParse(j['occurredAt']) : null;
    return EventAmount(
      id: localId ?? (j['id'] as String),
      serverId: j['id'] as String,
      eventId: eventId,
      stage: j['stage'] as String,
      cents: j['cents'] as int? ?? 0,
      quantity: j['quantity'] as int?,
      itemDesc: j['itemDesc'] as String?,
      note: j['note'] as String?,
      rewardMethod: j['rewardMethod'] as String?,
      occurredAt:
          occurred?.millisecondsSinceEpoch ?? DateTime.now().millisecondsSinceEpoch,
      synced: 1,
    );
  }
}
