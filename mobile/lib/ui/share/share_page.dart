import 'package:flutter/material.dart';
import '../../core/constants.dart';
import '../../core/money.dart' as money;
import '../../data/local/ledger_dao.dart';
import '../../data/local/trip_dao.dart';
import '../../data/models/ledger.dart';
import '../../theme/design_tokens.dart';
import '../home_page.dart';

/// 只读分享公开页（1:1 对齐网页端 src/app/share/[token]/page.tsx）。
///
/// 网页端用签名 token 在服务端解析出 ledgerId 后，渲染只读的 TravelView（含
/// 支出明细、合计、成员、AA 结算等）。本地优先无后端验签，这里以 token 最佳
/// 匹配本地账本（id / serverId），并复用本地 trip DAO 聚合真实只读摘要：
///   · 命中且未删除 / 未归档 / 为旅游账本 → 顶部「只读分享页」横幅 + 只读摘要；
///   · 否则（未命中 / 已删除 / 已归档 / 非旅游）→ Invalid 状态（对齐网页文案）。
/// 不内嵌可交互 TravelPage，确保只读、且不破坏主旅游页（其写操作未做 readOnly 隔离）。
class SharePage extends StatefulWidget {
  final String token;
  const SharePage({super.key, required this.token});

  @override
  State<SharePage> createState() => _SharePageState();
}

class _SharePageState extends State<SharePage> {
  Ledger? _ledger;
  bool _loading = true;
  int _expenseCount = 0;
  int _expenseTotalBaseCents = 0;
  int _memberCount = 0;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  Future<void> _resolve() async {
    Ledger? found = await LedgerDao().getById(widget.token);
    found ??= await LedgerDao().getByServerId(widget.token);
    if (!mounted) return;
    _ledger = found;
    if (found != null && !_invalid) {
      final exps = await TripDao().listExpenses(found.id);
      final mems = await TripDao().listMembers(found.id);
      _expenseCount = exps.length;
      _expenseTotalBaseCents = exps.fold(0, (s, e) => s + e.amountBaseCents);
      _memberCount = mems.length;
    }
    _loading = false;
    setState(() {});
  }

  /// 对齐网页端三段校验：未命中 / 已删除·已归档 / 非旅游 均视为无效。
  bool get _invalid {
    final l = _ledger;
    if (l == null) return true;
    if (l.deletedAt != null || l.archived) return true;
    if (l.kind != AppConfig.kindTravel) return true;
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;

    return Scaffold(
      backgroundColor: pageBg,
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 顶部只读横幅（对齐网页端「🔗 只读分享页 · 数据仅供查看，无法修改」，text-xs=12px）
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: surface,
                  border: Border.all(color: border, width: 1),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '🔗 只读分享页 · 数据仅供查看，无法修改',
                        style: TextStyle(color: ink500, fontSize: 12),
                      ),
                    ),
                    const SizedBox(width: 8),
                    GestureDetector(
                      onTap: _openApp,
                      child: Text(
                        '打开心愿便利贴',
                        style: TextStyle(
                          color: isDark
                              ? AppColors.darkInk100
                              : AppColors.lightInk900,
                          fontSize: 12,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              if (_loading)
                _ShareHint('加载中…', ink400)
              else if (_invalid)
                _ShareInvalid(
                  message: _ledger == null
                      ? '分享链接无效或已过期'
                      : (_ledger!.kind != AppConfig.kindTravel
                          ? '仅旅游账本支持只读分享'
                          : '该账本已不可访问'),
                )
              else
                _ShareReadOnly(
                  ledger: _ledger!,
                  expenseCount: _expenseCount,
                  expenseTotalBaseCents: _expenseTotalBaseCents,
                  memberCount: _memberCount,
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _openApp() {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const HomePage()),
      (route) => false,
    );
  }
}

/// 只读账本摘要（命中且有效的旅游账本）。聚合本地真实支出/成员，贴近网页端
/// TravelView 的只读概览（支出笔数、合计花费、成员），确保只读。
class _ShareReadOnly extends StatelessWidget {
  final Ledger ledger;
  final int expenseCount;
  final int expenseTotalBaseCents;
  final int memberCount;
  const _ShareReadOnly({
    required this.ledger,
    required this.expenseCount,
    required this.expenseTotalBaseCents,
    required this.memberCount,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final tileBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;

    final icon = ledger.icon?.isNotEmpty == true ? ledger.icon! : '🧳';
    final budget = ledger.tripBudget;
    final currency = ledger.baseCurrency ?? 'CNY';
    final totalText = money.Money.formatCents(expenseTotalBaseCents,
        symbol: currency == 'CNY' ? '¥' : '$currency ');

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: surface,
        border: Border.all(color: border, width: 1),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: tileBg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(icon, style: const TextStyle(fontSize: 24)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(ledger.displayName,
                        style: TextStyle(
                            color: ink900,
                            fontSize: 18,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text('旅游账本 · 只读',
                        style: TextStyle(color: ink500, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _InfoRow('基础币种', currency, ink500, ink900),
          if (budget != null && budget.isNotEmpty)
            _InfoRow('行程预算', budget, ink500, ink900),
          _InfoRow('支出笔数', '$expenseCount 笔', ink500, ink900),
          _InfoRow('合计花费', totalText, ink500, ink900),
          _InfoRow('成员', '$memberCount 人', ink500, ink900),
          const SizedBox(height: 12),
          Text('数据仅供查看，无法修改或新增条目。',
              style: TextStyle(color: ink400, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _InfoRow(String k, String v, Color kc, Color vc) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(k, style: TextStyle(color: kc, fontSize: 13)),
            Text(v,
                style: TextStyle(
                    color: vc, fontSize: 13, fontWeight: FontWeight.w600)),
          ],
        ),
      );
}

/// 无效 / 过期 / 不可访问状态（对齐网页端 Invalid 组件：icon text-4xl=36px、副文 text-sm=14px）。
class _ShareInvalid extends StatelessWidget {
  final String message;
  const _ShareInvalid({required this.message});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final btnBg = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final btnText = isDark ? AppColors.lightInk900 : Colors.white;

    return Center(
      child: Padding(
        padding: const EdgeInsets.only(top: 64),
        child: Column(
          children: [
            const Text('🔗', style: TextStyle(fontSize: 36)),
            const SizedBox(height: 16),
            Text(message,
                style: TextStyle(
                    color: ink900, fontSize: 18, fontWeight: FontWeight.w500)),
            const SizedBox(height: 8),
            Text('链接可能已过期或被撤销',
                style: TextStyle(color: ink500, fontSize: 14)),
            const SizedBox(height: 24),
            SizedBox(
              width: 200,
              height: 44,
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const HomePage()),
                  (route) => false,
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: btnBg,
                  foregroundColor: btnText,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: const Text('前往心愿便利贴',
                    style:
                        TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 加载中提示（左对齐，复用页面容器内边距）。
class _ShareHint extends StatelessWidget {
  final String text;
  final Color color;
  const _ShareHint(this.text, this.color);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Text(text, style: TextStyle(color: color, fontSize: 13)),
      );
}
