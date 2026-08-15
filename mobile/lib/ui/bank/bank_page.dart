import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import '../../theme/design_tokens.dart';
import '../../state/theme_state.dart';
import '../../state/auth_state.dart';
import '../../state/security_state.dart';
import '../../api/card_api.dart';
import '../../api/api_client.dart';
import '../../core/exceptions.dart';
import '../../data/local/bank_card_dao.dart';
import '../../data/models/bank_card.dart';
import '../../sync/sync_service.dart';
import '../../security/biometric_service.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/page_header.dart';

/// 银行卡备份页（设计 2:133 / 网页 src/app/cards）。
///
/// 本地优先：卡号仅存后四位，读写走 [BankCardDao]。进入前需"解锁"（对齐网页
/// [CardsUnlockGate] 的 tap-to-reveal 验密门概念），解锁后可直接查看与编辑。
///
/// 安全模型（[#3][#5]）：
///  - 进入即先读本地缓存（即时渲染，即点即开），再从服务端后台同步，不阻塞首屏；
///  - 未解锁（_revealed=false）时，卡片只显示尾号 `**** last4`，不渲染完整卡号、
///    不提供复制卡号/复制完整信息/编辑，避免"未验密直接看到完整银行卡信息"；
///  - 解锁（密码或指纹/面容）后 10 分钟 TTL 内可查看与编辑，超时自动上锁。
class BankPage extends StatefulWidget {
  const BankPage({super.key});

  @override
  State<BankPage> createState() => _BankPageState();
}

class _BankPageState extends State<BankPage> {
  final List<BankCard> _cards = [];
  bool _loading = true;
  bool _revealed = false;
  /// 最近一次银行卡同步的错误（null 表示成功）。用于 UI 提示，避免静默吞错 [#5]
  String? _cardError;
  /// 生物识别解锁的提示（如未检测到登录密码需回退密码）。
  String? _bioHint;
  Timer? _lockTimer;

  /// 解锁时间戳（epoch ms）持久化键：解锁后 10 分钟内查看卡号无需再次验密，
  /// 退出页面/杀进程后重进仍在窗口期内则自动保持明文态；超时自动上锁 [#3]。
  static const String _kBankUnlockAt = 'bank_unlock_at';
  static const int _kTtlMs = 10 * 60 * 1000;

  @override
  void initState() {
    super.initState();
    // 先恢复「10 分钟内免验密」状态（持久化时间戳），再即时渲染本地缓存 [#3]
    _restoreUnlock();
    // 进入即先从本地缓存即时渲染（即点即开），再从服务端后台同步，不阻塞首屏 [#3]
    _load();
    _refreshFromServer();
  }

  /// 从服务端拉取银行卡后刷新本地展示：解锁后含完整卡号，
  /// 故解锁或进入页面都应触发一次，解决卡号/卡信息不从服务端同步的问题 [#5]。
  /// 同时捕获同步错误用于 UI 提示（此前被静默吞掉）。
  Future<void> _refreshFromServer() async {
    final err = await SyncService.instance.pullBankCards();
    if (!mounted) return;
    _cardError = err;
    await _load();
  }

  @override
  void dispose() {
    _lockTimer?.cancel();
    super.dispose();
  }

  /// 解锁成功：进入明文态、持久化解锁时间戳并启动 10 分钟 TTL（对齐网页端
  /// lockAtMs 自动上锁）。重进页面时若仍在窗口期内则自动保持明文态 [#3]。
  void _reveal() {
    setState(() => _revealed = true);
    _persistUnlock();
    _startLockTimer(_kTtlMs);
  }

  /// 启动 TTL 定时器；[ttlMs] 为剩余毫秒，使重进页面时从「剩余时间」倒数而非整 10 分钟。
  void _startLockTimer(int ttlMs) {
    _lockTimer?.cancel();
    _lockTimer = Timer(Duration(milliseconds: ttlMs), () {
      if (mounted) _lockAfterTtl();
    });
  }

  /// 超时/手动上锁：退出明文态并清除持久化时间戳。
  void _lockAfterTtl() {
    if (!mounted) return;
    setState(() => _revealed = false);
    _clearUnlock();
  }

  /// 恢复「10 分钟内免验密」：读取持久化时间戳，未过期则自动进入明文态并从
  /// 剩余时间启动 TTL；已过期则清除（避免脏时间戳拖累下次判断）[#3]。
  Future<void> _restoreUnlock() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final at = prefs.getInt(_kBankUnlockAt);
      if (at == null) return;
      final elapsed = DateTime.now().millisecondsSinceEpoch - at;
      if (elapsed < _kTtlMs) {
        if (mounted) {
          setState(() => _revealed = true);
          _startLockTimer(_kTtlMs - elapsed);
        }
      } else {
        await prefs.remove(_kBankUnlockAt);
      }
    } catch (_) {
      // 读取失败：当作未解锁，正常走验密流程
    }
  }

  Future<void> _persistUnlock() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_kBankUnlockAt, DateTime.now().millisecondsSinceEpoch);
    } catch (_) {
      // 写入失败：不影响本次解锁，仅失去跨页面/重启免验密
    }
  }

  Future<void> _clearUnlock() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_kBankUnlockAt);
    } catch (_) {
      // 忽略
    }
  }

  /// 用登录密码走服务端解锁并写回完整卡号，成功后揭示卡片。
  /// 返回 null 表示成功，否则返回展示给用户的错误信息 [#3][#5]。
  Future<String?> _revealWithPassword(String pwd) async {
    try {
      await CardApi(ApiClient.instance).unlock(pwd);
    } on ApiException catch (e) {
      return e.message;
    } catch (e) {
      return '解锁失败：$e';
    }
    try {
      final unlocked = await CardApi(ApiClient.instance).list();
      final locals = await BankCardDao().listAll();
      final byServer = <String, BankCard>{};
      for (final c in locals) {
        if (c.serverId != null) byServer[c.serverId!] = c;
      }
      // 解锁成功：GET /api/cards 返回服务端所有卡（含解密完整卡号）。
      // 对每张服务端卡 upsert 到本地：已映射的复用 local.id/createdAt，
      // 服务端新增但本地没有的卡也新建（此前若 local==null 会跳过 → 卡号不同步）。[#5]
      for (final j in unlocked) {
        final sid = j['id'] as String?;
        if (sid == null) continue;
        final local = byServer[sid];
        final card = BankCard.fromApi(
          j,
          localId: local?.id ?? const Uuid().v4(),
          createdAt: local?.createdAt,
        ).copyWith(number: j['number'] as String?);
        await BankCardDao().upsert(card);
      }
    } catch (e) {
      // 卡号写回失败不阻塞解锁：用户至少能看到本地已存卡号，下次同步再补。[#5]
      // ignore: avoid_print
      print('银行卡解锁后写回失败：$e');
    }
    if (!mounted) return null;
    _reveal();
    await _load();
    return null;
  }

  /// 生物识别解锁：验证通过后，用本地记住的登录密码走服务端解锁取回完整卡号 [#4]。
  /// **仅在「仅银行卡」模式下提供**（全局锁下整个 App 已被 [BioGate] 验证，避免重复指纹）[#2]。
  Future<void> _biometricUnlock() async {
    final sec = context.read<SecurityState>();
    if (sec.mode != BioLockMode.bank) return;
    final ok = await BiometricService.authenticate('验证指纹/面容以查看银行卡');
    if (!ok || !mounted) return;
    final pwd = context.read<AuthState>().loginPassword;
    if (pwd == null) {
      if (mounted) setState(() => _bioHint = '未检测到登录密码，请使用密码解锁');
      return;
    }
    // 指纹通过立即揭示：本地缓存已含卡号尾号，卡片即时可见，无需等服务端往返 [#1]
    _reveal();
    // 后台走服务端解锁取回完整卡号；若服务端解锁失败则回退上锁并提示
    final err = await _revealWithPassword(pwd);
    if (!mounted) return;
    if (err != null) {
      setState(() {
        _revealed = false;
        _bioHint = err;
      });
      _clearUnlock();
    }
  }

  Future<void> _load() async {
    final list = await BankCardDao().listAll();
    if (!mounted) return;
    _cards
      ..clear()
      ..addAll(list);
    _loading = false;
    setState(() {});
  }

  Future<void> _saveCard(BankCard c) async {
    await BankCardDao().upsert(c);
  }

  Future<void> _remove(BankCard c) async {
    final ok = await _confirm(
      context,
      title: '删除「${c.alias ?? c.bank}」？',
      body: '这张卡的记录会被永久删除，不进回收站。',
      confirmText: '删除',
    );
    if (!ok || !mounted) return;
    await BankCardDao().delete(c.id);
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('已删除')));
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    context.watch<ThemeState>();
    final sec = context.watch<SecurityState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;

    return Scaffold(
      backgroundColor: pageBg,
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
                const PageHeader(
                  icon: '💳',
                  title: '银行卡',
                  subtitle: '加密存储卡号 · 查看需验密码或指纹',
                ),
                if (!_revealed) ...<Widget>[
                  _UnlockGate(onRevealWithPassword: _revealWithPassword),
                  // 仅在「仅银行卡」模式下显示生物识别按钮：全局锁下整个 App
                  // 已被 BioGate 验证，进银行卡页不应再弹一次指纹 [#2]。
                  if (sec.mode == BioLockMode.bank)
                    _BiometricButton(
                      onTap: _biometricUnlock,
                      hint: _bioHint,
                    ),
                ],
                if (_revealed) ...<Widget>[
                  AppCard(
                    frosted: false,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              '已验密，卡号直接显示；10 分钟后自动上锁。'
                              '卡号与备注以 AES-256-GCM 加密存储，数据库文件泄露也读不出。'
                              '本应用不存 CVV 和取款密码，也请不要写进备注。',
                              style: TextStyle(color: ink500, fontSize: 11),
                            ),
                          ),
                          GestureDetector(
                            onTap: () {
                              _lockTimer?.cancel();
                              setState(() => _revealed = false);
                              _clearUnlock();
                            },
                            child: Text('立即上锁',
                                style: TextStyle(color: ink500, fontSize: 11)),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  _AddCardButton(
                    onPressed: () => showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => _CardSheet(
                        onSave: (c) async {
                          await _saveCard(c);
                          if (mounted) Navigator.of(context).pop();
                        },
                      ),
                    ).then((_) {
                      if (mounted) _load();
                    }),
                  ),
                  const SizedBox(height: 8),
                ],
                // 锁态也展示已从服务端/本地拉取的（打码）卡片：对齐网页端「进页面先看到尾号」，
                // 不再把整列藏在解锁门后面；未解锁只显示尾号，不暴露完整卡号 [#3]
                if (_loading)
                  _hint('加载中…', ink400)
                else if (_cards.isEmpty)
                  _hint(
                    _cardError != null
                        ? '银行卡同步失败：$_cardError'
                        : '还没有记录任何卡片',
                    ink500,
                  )
                else
                  ..._cards.map(
                    (c) => _BankCardTile(
                      card: c,
                      revealed: _revealed,
                      onEdit: () => showModalBottomSheet(
                        context: context,
                        isScrollControlled: true,
                        builder: (_) => _CardSheet(
                          initial: c,
                          onSave: (updated) async {
                            await _saveCard(updated);
                            if (mounted) Navigator.of(context).pop();
                          },
                        ),
                      ).then((_) {
                        if (mounted) _load();
                      }),
                      onRemove: _remove,
                    ),
                  ),
              ],
            ),
          ),
        ),
    );
  }
}

Widget _hint(String text, Color color) => Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text(text, style: TextStyle(color: color, fontSize: 13)),
    );

/// 生物识别解锁按钮（仅当安全设置启用时由调用方决定是否展示）。
class _BiometricButton extends StatelessWidget {
  final VoidCallback onTap;
  final String? hint;

  const _BiometricButton({required this.onTap, this.hint});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 12),
        SizedBox(
          height: 48,
          child: ElevatedButton(
            onPressed: onTap,
            style: ElevatedButton.styleFrom(
              backgroundColor: ink900,
              foregroundColor:
                  isDark ? AppColors.darkCtaText : AppColors.lightSurface,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: const Text('使用指纹/面容解锁',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          ),
        ),
        if (hint != null) ...[
          const SizedBox(height: 8),
          Text(hint!,
              style: TextStyle(color: red, fontSize: 13),
              textAlign: TextAlign.center),
        ],
      ],
    );
  }
}

/// 添加卡片按钮：border-dashed 描边（对齐网页端 `border-2 border-dashed`）。
///
/// 复用 codebase 既有的 [AppColors.lightBorderDashed]/[AppColors.darkBorderDashed]
/// 令牌（home_page / recurring 等同款「虚线感」处理，Flutter 无原生 dashed border）。
class _AddCardButton extends StatelessWidget {
  final VoidCallback onPressed;

  const _AddCardButton({required this.onPressed});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final border = isDark ? AppColors.darkBorderDashed : AppColors.lightBorderDashed;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          side: BorderSide(color: border, width: 2),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          padding: const EdgeInsets.symmetric(vertical: 14),
          backgroundColor: Colors.transparent,
        ),
        child: Text('＋ 添加卡片',
            style: TextStyle(color: ink500, fontSize: 14)),
      ),
    );
  }
}

class _UnlockGate extends StatefulWidget {
  /// 验证通过（密码已比对一致）后，由父级用该密码走服务端解锁并揭示卡片；
  /// 返回 null 表示成功，非 null 为错误信息（用于本组件内展示）。
  final Future<String?> Function(String) onRevealWithPassword;

  const _UnlockGate({required this.onRevealWithPassword});

  @override
  State<_UnlockGate> createState() => _UnlockGateState();
}

class _UnlockGateState extends State<_UnlockGate> {
  final _password = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final input = _password.text;
    if (input.isEmpty) {
      setState(() => _error = '请输入登录密码');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    // 对齐网页端 CardsUnlockGate：验证的是登录密码（AuthState.loginPassword），
    // 非本地随意开关。
    final stored = context.read<AuthState>().loginPassword;
    await Future<void>.delayed(const Duration(milliseconds: 250)); // 模拟验密
    if (!mounted) return;
    if (stored == null) {
      setState(() {
        _busy = false;
        _error = '请先登录后再解锁';
      });
      return;
    }
    if (input != stored) {
      setState(() {
        _busy = false;
        _error = '密码错误';
      });
      return;
    }
    // 本地密码匹配后，交由父级走服务端解锁（取回完整卡号）并揭示。[#5]
    final err = await widget.onRevealWithPassword(input);
    if (!mounted) return;
    if (err != null) {
      setState(() {
        _busy = false;
        _error = err;
      });
      return;
    }
    // 成功：父级已 _reveal() 并重建，本组件被移除，无需再 setState。
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final fill = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final textOn = isDark ? AppColors.darkCtaText : AppColors.lightSurface;

    return Column(
      children: [
        AppCard(
          frosted: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              '进入前请输入登录密码。解锁后 10 分钟内查看卡号无需再次验密；超时自动上锁。',
              style: TextStyle(color: ink500, fontSize: 12),
            ),
          ),
        ),
        const SizedBox(height: 12),
        AppCard(
          frosted: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                const Text('🔒', style: TextStyle(fontSize: 40)),
                const SizedBox(height: 8),
                Text('银行卡备份已上锁',
                    style: TextStyle(
                        color: ink900, fontSize: 16, fontWeight: FontWeight.w600)),
                const SizedBox(height: 12),
                AppTextField(
                  hint: '登录密码',
                  obscure: true,
                  controller: _password,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(_error!,
                      style: TextStyle(
                          color: isDark
                              ? AppColors.darkSemanticRed
                              : AppColors.lightSemanticRed,
                          fontSize: 13)),
                ],
                const SizedBox(height: 12),
                SizedBox(
                  height: 48,
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _busy ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: fill,
                      foregroundColor: textOn,
                      disabledForegroundColor: textOn.withOpacity(0.6),
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: _busy
                        ? const Text('验证中…',
                            style: TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w600))
                        : const Text('解锁',
                            style: TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _BankCardTile extends StatefulWidget {
  final BankCard card;
  final bool revealed;
  final VoidCallback onEdit;
  final Future<void> Function(BankCard) onRemove;

  const _BankCardTile({
    required this.card,
    required this.revealed,
    required this.onEdit,
    required this.onRemove,
  });

  @override
  State<_BankCardTile> createState() => _BankCardTileState();
}

class _BankCardTileState extends State<_BankCardTile> {
  String? _copied; // 'number' | 'full'

  Future<void> _copy(String text, String kind) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    setState(() => _copied = kind);
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('已复制')));
    Future<void>.delayed(const Duration(milliseconds: 1500), () {
      if (mounted && _copied == kind) setState(() => _copied = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    final card = widget.card;
    final revealed = widget.revealed;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final blue = isDark ? AppColors.darkSemanticBlue : AppColors.lightSemanticBlue;
    final icon = card.type == '信用卡' ? '🏧' : '🏦';

    // 未解锁时只显示尾号，不渲染完整卡号、不提供复制/编辑 [#3]
    final showFull =
        revealed && card.number != null && card.number!.isNotEmpty;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        frosted: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(icon, style: TextStyle(fontSize: 24, color: ink900)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(card.alias ?? card.bank,
                        style: TextStyle(color: ink900, fontSize: 18)),
                    const SizedBox(height: 2),
                    Text(
                      <String>[
                        card.bank,
                        card.type,
                        if (card.holder != null && card.holder!.isNotEmpty)
                          card.holder!,
                      ].join(' · '),
                      style: TextStyle(color: ink500, fontSize: 13),
                    ),
                    const SizedBox(height: 2),
                    if (showFull)
                      Text(BankCard.groupCardNumber(card.number!),
                          style: TextStyle(
                              color: ink900,
                              fontSize: 14,
                              letterSpacing: 1))
                    else
                      Text('**** ${card.last4}',
                          style: TextStyle(color: ink500, fontSize: 14)),
                    if (card.note != null && card.note!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text('备注：${card.note!}',
                            style: TextStyle(color: ink500, fontSize: 13)),
                      ),
                    if (showFull) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 16,
                        children: [
                          GestureDetector(
                            onTap: () => _copy(card.number!, 'number'),
                            child: Text(
                              _copied == 'number' ? '已复制 ✓' : '复制卡号',
                              style: TextStyle(color: blue, fontSize: 13),
                            ),
                          ),
                          GestureDetector(
                            onTap: () => _copy(
                              buildCardShareText(
                                bankName: card.bank,
                                holder: card.holder,
                                number: card.number!,
                              ),
                              'full',
                            ),
                            child: Text(
                              _copied == 'full' ? '已复制 ✓' : '复制完整信息',
                              style: TextStyle(color: blue, fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 12),
              if (revealed)
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    GestureDetector(
                      onTap: widget.onEdit,
                      child: Text('编辑',
                          style: TextStyle(color: ink500, fontSize: 13)),
                    ),
                    const SizedBox(height: 8),
                    GestureDetector(
                      onTap: () => widget.onRemove(card),
                      child: Text('删除',
                          style: TextStyle(color: ink500, fontSize: 13)),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TypeChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _TypeChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final fill = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final textOn = isDark ? AppColors.darkCtaText : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: selected ? fill : Colors.transparent,
          border: Border.all(color: selected ? fill : border),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Center(
          child: Text(label,
              style: TextStyle(
                  color: selected ? textOn : ink900, fontSize: 14)),
        ),
      ),
    );
  }
}

class _CardSheet extends StatefulWidget {
  final BankCard? initial;
  final Future<void> Function(BankCard) onSave;

  const _CardSheet({this.initial, required this.onSave});

  @override
  State<_CardSheet> createState() => _CardSheetState();
}

class _CardSheetState extends State<_CardSheet> {
  final _bank = TextEditingController();
  final _number = TextEditingController();
  final _alias = TextEditingController();
  final _holder = TextEditingController();
  final _note = TextEditingController();
  String _type = '储蓄卡';

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    if (i != null) {
      _bank.text = i.bank;
      _number.text = i.number ?? i.last4;
      _alias.text = i.alias ?? '';
      _holder.text = i.holder ?? '';
      _note.text = i.note ?? '';
      _type = i.type;
    }
  }

  @override
  void dispose() {
    _bank.dispose();
    _number.dispose();
    _alias.dispose();
    _holder.dispose();
    _note.dispose();
    super.dispose();
  }

  void _save() async {
    final bank = _bank.text.trim();
    final number = _number.text.trim();
    if (bank.isEmpty || number.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请填写银行名与卡号')),
      );
      return;
    }
    final digits = number.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 4) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('卡号至少 4 位')),
      );
      return;
    }
    final last4 = digits.substring(digits.length - 4);
    final now = DateTime.now().millisecondsSinceEpoch;
    final card = BankCard(
      id: widget.initial?.id ?? const Uuid().v4(),
      bank: bank,
      type: _type,
      last4: last4,
      number: number,
      alias: _alias.text.trim().isEmpty ? null : _alias.text.trim(),
      holder: _holder.text.trim().isEmpty ? null : _holder.text.trim(),
      note: _note.text.trim().isEmpty ? null : _note.text.trim(),
      synced: 0,
      createdAt: widget.initial?.createdAt ?? now,
    );
    await widget.onSave(card);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.initial == null ? '添加卡片' : '编辑卡片',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          AppTextField(hint: '银行名', controller: _bank),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _TypeChip(
                  label: '储蓄卡',
                  selected: _type == '储蓄卡',
                  onTap: () => setState(() => _type = '储蓄卡'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _TypeChip(
                  label: '信用卡',
                  selected: _type == '信用卡',
                  onTap: () => setState(() => _type = '信用卡'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          AppTextField(hint: '完整卡号（本地加密存储）', controller: _number),
          const SizedBox(height: 12),
          AppTextField(hint: '卡别名（选填）', controller: _alias),
          const SizedBox(height: 12),
          AppTextField(hint: '持卡人（选填）', controller: _holder),
          const SizedBox(height: 12),
          AppTextField(hint: '备注（可选，别写密码和 CVV）', controller: _note),
          const SizedBox(height: 16),
          AppPrimaryButton(label: '保存', onPressed: _save),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

Future<bool> _confirm(
  BuildContext context, {
  required String title,
  required String body,
  String confirmText = '确认',
}) async {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('取消'),
        ),
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(confirmText, style: TextStyle(color: red)),
        ),
      ],
    ),
  );
  return confirmed ?? false;
}
