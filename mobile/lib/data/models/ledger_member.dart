/// 账本协作（LedgerMember）领域模型与角色语义（对齐网页端 src/lib/ledgerRole.ts）。
///
/// 注意：账本协作用的是「邀请 token 链接」模型（/invite/<token>），不是按用户名
/// 直接添加；旅游账本的「同伴」(TripMember) 是另一套实体，与此无关。

enum LedgerRole { owner, editor, viewer }

const Map<LedgerRole, String> _kRoleLabels = {
  LedgerRole.owner: '拥有者',
  LedgerRole.editor: '编辑者',
  LedgerRole.viewer: '只读',
};

/// 角色中文标签。
String roleLabel(LedgerRole r) => _kRoleLabels[r] ?? '成员';

/// 角色 → 服务端 API 字符串。
String roleToApi(LedgerRole r) {
  switch (r) {
    case LedgerRole.owner:
      return 'owner';
    case LedgerRole.editor:
      return 'editor';
    case LedgerRole.viewer:
      return 'viewer';
  }
}

/// 服务端角色字符串 → 枚举（非法值回退 viewer）。
LedgerRole? parseRole(String? s) {
  switch (s) {
    case 'owner':
      return LedgerRole.owner;
    case 'editor':
      return LedgerRole.editor;
    case 'viewer':
      return LedgerRole.viewer;
    default:
      return null;
  }
}

/// 协作成员（GET /api/ledgers/[id]/collaborators 的 members 项）。
class LedgerMember {
  final String userId;
  final String username;
  final LedgerRole role;
  final bool isSelf;
  final String? createdAt;

  const LedgerMember({
    required this.userId,
    required this.username,
    required this.role,
    required this.isSelf,
    this.createdAt,
  });

  factory LedgerMember.fromApi(Map<String, dynamic> j) => LedgerMember(
        userId: j['userId'] as String,
        username: j['username'] as String,
        role: parseRole(j['role'] as String?) ?? LedgerRole.viewer,
        isSelf: j['isSelf'] as bool? ?? false,
        createdAt: j['createdAt'] as String?,
      );
}

/// 待接受 / 已生成的邀请（owner 视角）。
class LedgerInvite {
  final String id;
  final String token;
  final LedgerRole role;
  final String? createdAt;
  final String? expiresAt;

  const LedgerInvite({
    required this.id,
    required this.token,
    required this.role,
    this.createdAt,
    this.expiresAt,
  });

  factory LedgerInvite.fromApi(Map<String, dynamic> j) => LedgerInvite(
        id: j['id'] as String,
        token: j['token'] as String,
        role: parseRole(j['role'] as String?) ?? LedgerRole.viewer,
        createdAt: j['createdAt'] as String?,
        expiresAt: j['expiresAt'] as String?,
      );

  /// 邀请链接（与网页端 /invite/<token> 同语义）。
  String link(String apiBaseUrl) => '$apiBaseUrl/invite/$token';
}

/// 邀请预览（GET /api/invites/[token]，用于接受前展示账本信息）。
class InvitePreview {
  final String ledgerId;
  final String ledgerName;
  final String? ledgerKind;
  final String? ledgerIcon;
  final LedgerRole role;
  final bool accepted;
  final bool alreadyMember;

  const InvitePreview({
    required this.ledgerId,
    required this.ledgerName,
    this.ledgerKind,
    this.ledgerIcon,
    required this.role,
    required this.accepted,
    required this.alreadyMember,
  });

  factory InvitePreview.fromApi(Map<String, dynamic> j) => InvitePreview(
        ledgerId: j['ledgerId'] as String,
        ledgerName: j['ledgerName'] as String? ?? '账本',
        ledgerKind: j['ledgerKind'] as String?,
        ledgerIcon: j['ledgerIcon'] as String?,
        role: parseRole(j['role'] as String?) ?? LedgerRole.viewer,
        accepted: j['accepted'] as bool? ?? false,
        alreadyMember: j['alreadyMember'] as bool? ?? false,
      );
}
