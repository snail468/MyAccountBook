import 'dart:convert';

/// 离线队列中的一条待同步操作。
///
/// 本地写入先落本地库（乐观更新 UI），再入队一条 PendingOp。
/// 联网时 [SyncService] 按 createdAt 顺序重放：POST/PUT/DELETE 到 [path]，
/// 成功则删除本行并标记本地业务行 synced=1；失败（网络）保留下次重试。
class PendingOp {
  final int? id; // 本地自增主键
  final String opUuid; // 唯一标识，避免重复入队
  final String method; // POST | PUT | DELETE
  final String path; // 相对 /api 的路径，如 /ledgers/xxx/entries
  final String? body; // JSON 字符串
  final String? clientId; // 幂等键（创建类）
  final String? entity; // 业务实体名，如 'general_entry'
  final String? entityLocalId; // 对应的本地行 id（成功后可标记 synced）
  final int createdAt;
  final int attempts;
  final String status; // pending | done | failed

  PendingOp({
    this.id,
    required this.opUuid,
    required this.method,
    required this.path,
    this.body,
    this.clientId,
    this.entity,
    this.entityLocalId,
    required this.createdAt,
    this.attempts = 0,
    this.status = 'pending',
  });

  factory PendingOp.fromDb(Map<String, dynamic> m) => PendingOp(
        id: m['id'] as int?,
        opUuid: m['op_uuid'] as String,
        method: m['method'] as String,
        path: m['path'] as String,
        body: m['body'] as String?,
        clientId: m['client_id'] as String?,
        entity: m['entity'] as String?,
        entityLocalId: m['entity_local_id'] as String?,
        createdAt: m['created_at'] as int,
        attempts: m['attempts'] as int? ?? 0,
        status: m['status'] as String? ?? 'pending',
      );

  Map<String, dynamic> toDb() => {
        'op_uuid': opUuid,
        'method': method,
        'path': path,
        'body': body,
        'client_id': clientId,
        'entity': entity,
        'entity_local_id': entityLocalId,
        'created_at': createdAt,
        'attempts': attempts,
        'status': status,
      };

  /// 解析请求体（POST/PUT 时用）。
  dynamic get decodedBody {
    if (body == null || body!.isEmpty) return null;
    try {
      return jsonDecode(body!);
    } catch (_) {
      return null;
    }
  }
}
