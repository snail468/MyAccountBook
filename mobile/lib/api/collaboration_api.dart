import 'api_client.dart';
import '../data/models/ledger_member.dart';

/// 账本协作接口（对齐网页端 src/app/api/ledgers/[id]/collaborators(+[userId])、
/// /invites(+[inviteId])、/invites/[token]）。
///
/// 重要：所有以账本为目标的端点都用**服务端 cuid**（[Ledger.serverId]），
/// 不是本地 UUID。共享账本一定来自服务端、必有 serverId。
class CollaborationApi {
  final ApiClient _client;
  CollaborationApi(this._client);

  /// 列出成员与（owner 视角的）待接受邀请；返回 myRole / members / invites。
  Future<Map<String, dynamic>> list(String ledgerServerId) async {
    final d = await _client.get('/ledgers/$ledgerServerId/collaborators');
    return Map<String, dynamic>.from(d as Map);
  }

  /// 生成一条邀请链接（token），返回 id/token/role/expiresAt。
  Future<Map<String, dynamic>> createInvite(
      String ledgerServerId, LedgerRole role) async {
    final d = await _client.post('/ledgers/$ledgerServerId/invites',
        {'role': roleToApi(role)});
    return Map<String, dynamic>.from(d as Map);
  }

  /// 撤回一条尚未被接受的邀请。
  Future<void> revokeInvite(String ledgerServerId, String inviteId) async {
    await _client.delete('/ledgers/$ledgerServerId/invites/$inviteId');
  }

  /// 修改某成员角色（仅 owner；不能改自己/owner）。
  Future<void> updateRole(
      String ledgerServerId, String userId, LedgerRole role) async {
    await _client.patch('/ledgers/$ledgerServerId/collaborators/$userId',
        {'role': roleToApi(role)});
  }

  /// 移除某成员（owner 移除他人，或非 owner 移除自己=退出账本）。
  Future<void> removeMember(String ledgerServerId, String userId) async {
    await _client.delete('/ledgers/$ledgerServerId/collaborators/$userId');
  }

  /// 接受邀请前预览（GET /api/invites/[token]）。
  Future<InvitePreview> previewInvite(String token) async {
    final d = await _client.get('/invites/$token');
    return InvitePreview.fromApi(Map<String, dynamic>.from(d as Map));
  }

  /// 接受邀请，幂等；返回账本服务端 id。
  Future<String> acceptInvite(String token) async {
    final d = await _client.post('/invites/$token', null);
    return (d as Map)['ledgerId'] as String;
  }
}
