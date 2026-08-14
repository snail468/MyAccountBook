import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/constants.dart';
import '../../core/exceptions.dart';
import '../../api/api_client.dart';
import '../../api/collaboration_api.dart';
import '../../data/models/ledger.dart';
import '../../data/models/ledger_member.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/page_header.dart';

/// 账本协作管理页（对齐网页端 src/app/l/[id]/collaborators）。
///
/// - 成员列表：owner 对他人非 owner 成员可改角色(编辑者/只读)/移除；非 owner 仅能
///   对自己且非 owner 时「退出账本」。owner 角色不可被改/移除（服务端也会拦截）。
/// - 邀请区（仅 owner）：选角色 → 生成邀请链接（复制 + 撤回）。
/// - 协作基于「邀请 token 链接」，不做用户名直接添加（与旅游「同伴」TripMember 区分）。
class CollaboratorsPage extends StatefulWidget {
  final Ledger ledger;
  const CollaboratorsPage({super.key, required this.ledger});

  @override
  State<CollaboratorsPage> createState() => _CollaboratorsPageState();
}

class _CollaboratorsPageState extends State<CollaboratorsPage> {
  bool _loading = true;
  String? _error;
  LedgerRole _myRole = LedgerRole.viewer;
  List<LedgerMember> _members = [];
  List<LedgerInvite> _invites = [];
  bool _busy = false;
  LedgerRole _inviteRole = LedgerRole.editor;

  String? get _serverId => widget.ledger.serverId;
  bool get _isOwner => _myRole == LedgerRole.owner;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final sid = _serverId;
    if (sid == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '该账本尚未同步到服务端，暂无法管理协作（请先联网同步）';
      });
      return;
    }
    if (mounted) setState(() => _loading = true);
    try {
      final d = await CollaborationApi(ApiClient.instance).list(sid);
      final myRole = parseRole(d['myRole'] as String?) ?? LedgerRole.viewer;
      final members = (d['members'] as List? ?? [])
          .map((e) => LedgerMember.fromApi(Map<String, dynamic>.from(e as Map)))
          .toList();
      final invites = (d['invites'] as List? ?? [])
          .map((e) => LedgerInvite.fromApi(Map<String, dynamic>.from(e as Map)))
          .toList();
      if (!mounted) return;
      setState(() {
        _myRole = myRole;
        _members = members;
        _invites = invites;
        _loading = false;
        _error = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '加载失败：$e';
      });
    }
  }

  /// 包裹写操作的统一忙碌态 + 错误提示（服务端 4xx 的 message 直接展示）。
  Future<void> _withBusy(Future<void> Function() fn) async {
    if (_busy) return;
    if (mounted) setState(() => _busy = true);
    try {
      await fn();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('操作失败：$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _updateRole(LedgerMember m, LedgerRole role) async {
    final sid = _serverId;
    if (sid == null) return;
    await _withBusy(() async {
      await CollaborationApi(ApiClient.instance).updateRole(sid, m.userId, role);
      await _load();
    });
  }

  Future<void> _removeMember(LedgerMember m) async {
    final sid = _serverId;
    if (sid == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(m.isSelf ? '退出账本？' : '移除成员？'),
        content: Text(m.isSelf
            ? '退出后你将无法再查看该账本，除非重新被邀请。'
            : '移除后该成员将不再能访问此账本。'),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false), child: const Text('取消')),
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(true), child: const Text('确定')),
        ],
      ),
    );
    if (ok != true) return;
    await _withBusy(() async {
      await CollaborationApi(ApiClient.instance).removeMember(sid, m.userId);
      await _load();
    });
  }

  Future<void> _createInvite() async {
    final sid = _serverId;
    if (sid == null) return;
    await _withBusy(() async {
      final d = await CollaborationApi(ApiClient.instance)
          .createInvite(sid, _inviteRole);
      final token = d['token'] as String;
      final link = '${AppConfig.apiBaseUrl}/invite/$token';
      await Clipboard.setData(ClipboardData(text: link));
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('邀请链接已生成并复制到剪贴板')),
      );
    });
  }

  Future<void> _revokeInvite(LedgerInvite inv) async {
    final sid = _serverId;
    if (sid == null) return;
    await _withBusy(() async {
      await CollaborationApi(ApiClient.instance).revokeInvite(sid, inv.id);
      await _load();
    });
  }

  Future<void> _copyInvite(LedgerInvite inv) async {
    final link = inv.link(AppConfig.apiBaseUrl);
    await Clipboard.setData(ClipboardData(text: link));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('邀请链接已复制')));
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    return Scaffold(
      backgroundColor: pageBg,
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PageHeader(
                icon: '👥',
                title: '${widget.ledger.displayName} · 协作成员',
                subtitle: _isOwner
                    ? '你是账本拥有者，可管理成员与邀请'
                    : '你是${roleLabel(_myRole)}',
              ),
              if (_loading)
                Text('加载中…', style: TextStyle(color: ink500, fontSize: 13))
              else if (_error != null)
                AppCard(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_error!,
                            style: TextStyle(
                                color: isDark
                                    ? AppColors.darkSemanticRed
                                    : AppColors.lightSemanticRed,
                                fontSize: 13)),
                        const SizedBox(height: 8),
                        TextButton(onPressed: _load, child: const Text('重试')),
                      ],
                    ),
                  ),
                )
              else ...[
                Text('成员',
                    style: TextStyle(
                        color: ink900,
                        fontSize: 16,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                if (_members.isEmpty)
                  Text('还没有其他成员', style: TextStyle(color: ink500, fontSize: 13))
                else
                  ..._members.map((m) => _memberRow(m)),
                if (_isOwner) ...[
                  const SizedBox(height: 24),
                  Text('邀请协作者',
                      style: TextStyle(
                          color: ink900,
                          fontSize: 16,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  _invitePanel(),
                  if (_invites.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text('待接受的邀请',
                        style: TextStyle(color: ink500, fontSize: 13)),
                    const SizedBox(height: 8),
                    ..._invites.map((inv) => _inviteRow(inv)),
                  ],
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _memberRow(LedgerMember m) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final isOwnerMember = m.role == LedgerRole.owner;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AppCard(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${m.username}${m.isSelf ? '（你）' : ''}',
                        style: TextStyle(color: ink900, fontSize: 15)),
                    const SizedBox(height: 2),
                    Text(roleLabel(m.role),
                        style: TextStyle(color: ink500, fontSize: 12)),
                  ],
                ),
              ),
              if (_isOwner && !m.isSelf && !isOwnerMember) ...[
                DropdownButton<LedgerRole>(
                  value: m.role,
                  underline: const SizedBox.shrink(),
                  items: const [
                    DropdownMenuItem(
                        value: LedgerRole.editor, child: Text('编辑者')),
                    DropdownMenuItem(
                        value: LedgerRole.viewer, child: Text('只读')),
                  ],
                  onChanged: (r) {
                    if (r != null) _updateRole(m, r);
                  },
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: () => _removeMember(m),
                  child: Text('移除', style: TextStyle(color: red, fontSize: 13)),
                ),
              ] else if (!_isOwner && m.isSelf && !isOwnerMember) ...[
                TextButton(
                  onPressed: () => _removeMember(m),
                  child:
                      Text('退出账本', style: TextStyle(color: red, fontSize: 13)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _invitePanel() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final fill = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final textOn = isDark ? AppColors.lightInk900 : Colors.white;

    return AppCard(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('选择被邀请者的权限：',
                style: TextStyle(color: ink500, fontSize: 13)),
            const SizedBox(height: 8),
            SegmentedButton<LedgerRole>(
              segments: const [
                ButtonSegment(value: LedgerRole.editor, label: Text('编辑者')),
                ButtonSegment(value: LedgerRole.viewer, label: Text('只读')),
              ],
              selected: {_inviteRole},
              onSelectionChanged: (s) => setState(() => _inviteRole = s.first),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 44,
              child: ElevatedButton(
                onPressed: _busy ? null : _createInvite,
                style: ElevatedButton.styleFrom(
                  backgroundColor: fill,
                  foregroundColor: textOn,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                ),
                child: const Text('生成邀请链接'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _inviteRow(LedgerInvite inv) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AppCard(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${roleLabel(inv.role)} · 邀请链接',
                        style: TextStyle(color: ink900, fontSize: 14)),
                    const SizedBox(height: 2),
                    Text('点击「复制」分享给协作者',
                        style: TextStyle(color: ink500, fontSize: 12)),
                  ],
                ),
              ),
              TextButton(
                onPressed: () => _copyInvite(inv),
                child: const Text('复制'),
              ),
              TextButton(
                onPressed: _busy ? null : () => _revokeInvite(inv),
                child: Text('撤回', style: TextStyle(color: red, fontSize: 13)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
