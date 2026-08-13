import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/money.dart' as money;
import '../../core/constants.dart';
import '../../data/local/ledger_dao.dart';
import '../../data/models/ledger.dart';
import '../../data/models/trip.dart';
import '../../state/travel_state.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/money.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';

/// 旅游账本页：严格 1:1 还原网页端 TravelView 及其配套弹窗
/// （TravelSettingsModal / TripMembersModal / TripExpenseModal / TripFunReport /
///  TripDailyChart / TripCalendar）。本地优先：数据来自 [TravelState]，设置保存走
/// [LedgerDao.upsert]。

const List<({String code, String label})> _kCurrencies = [
  (code: 'CNY', label: '人民币 CNY'),
  (code: 'USD', label: '美元 USD'),
  (code: 'JPY', label: '日元 JPY'),
  (code: 'EUR', label: '欧元 EUR'),
  (code: 'GBP', label: '英镑 GBP'),
  (code: 'HKD', label: '港币 HKD'),
  (code: 'KRW', label: '韩元 KRW'),
  (code: 'TWD', label: '新台币 TWD'),
  (code: 'THB', label: '泰铢 THB'),
  (code: 'SGD', label: '新加坡元 SGD'),
  (code: 'AUD', label: '澳元 AUD'),
  (code: 'MOP', label: '澳门元 MOP'),
];

const List<String> _kCategories = [
  '餐饮',
  '交通',
  '住宿',
  '门票',
  '购物',
  '娱乐',
  '其它',
];

String _pad2(int n) => n.toString().padLeft(2, '0');
String _ymd(DateTime d) => '${d.year}-${_pad2(d.month)}-${_pad2(d.day)}';
String _md(int ms) {
  final d = DateTime.fromMillisecondsSinceEpoch(ms);
  return '${_pad2(d.month)}/${_pad2(d.day)}';
}

String _fmtDateTime(int ms) {
  final d = DateTime.fromMillisecondsSinceEpoch(ms);
  return '${_ymd(d)} ${_pad2(d.hour)}:${_pad2(d.minute)}';
}

String _compactYuan(int cents) {
  final y = cents / 100;
  if (y >= 10000) return '${(y / 10000).toStringAsFixed(1)}万';
  if (y >= 1000) return '${(y / 1000).toStringAsFixed(1)}k';
  return '${y.round()}';
}

DateTime? _parseDate(String s) => DateTime.tryParse(s);

List<String> _currencyCodes(String extra) {
  final set = <String>{for (final c in _kCurrencies) c.code};
  if (extra.isNotEmpty) set.add(extra);
  return set.toList();
}

String _trunc(String s, int n) => s.length > n ? '${s.substring(0, n)}…' : s;

String _weekday(String ymd) {
  final d = DateTime.tryParse(ymd);
  if (d == null) return '';
  const w = ['日', '一', '二', '三', '四', '五', '六'];
  return w[d.weekday % 7];
}

/// 点按花费缩略图 → 全屏查看（对应网页端 Lightbox）。
void _zoomTravelImage(BuildContext context, List<String> urls, int index) {
  showDialog(
    context: context,
    builder: (_) => Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(24),
      child: InteractiveViewer(
        child: Image.network(
          urls[index],
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => const Center(
            child: Icon(Icons.broken_image, color: Colors.white, size: 48),
          ),
        ),
      ),
    ),
  );
}

class _Net {
  const _Net(this.memberId, this.name, this.netCents, this.settled);
  final String memberId;
  final String name;
  final int netCents;
  final bool settled;
}

class TravelPage extends StatelessWidget {
  final Ledger ledger;
  const TravelPage({super.key, required this.ledger});

  @override
  Widget build(BuildContext context) => ChangeNotifierProvider(
        create: (_) => TravelState(ledger)..load(),
        child: const _TravelBody(),
      );
}

class _TravelBody extends StatefulWidget {
  const _TravelBody();

  @override
  State<_TravelBody> createState() => _TravelBodyState();
}

class _TravelBodyState extends State<_TravelBody> {
  String _phase = 'during';
  String? _dateFilter;
  bool _showCalendar = false;

  String? _shareUrl;
  bool _shareBusy = false;
  String _shareError = '';
  bool _shareCopied = false;

  void _pickPhase(String p) {
    setState(() {
      _phase = p;
      _dateFilter = null;
    });
  }

  void _pickDay(String date) {
    setState(() => _dateFilter = _dateFilter == date ? null : date);
  }

  void _openSettings() {
    final st = context.read<TravelState>();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) =>
          ChangeNotifierProvider.value(value: st, child: const _SettingsSheet()),
    );
  }

  void _openMembers() {
    final st = context.read<TravelState>();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) =>
          ChangeNotifierProvider.value(value: st, child: const _MembersSheet()),
    );
  }

  void _openExpense(TripExpense? editing) {
    final st = context.read<TravelState>();
    if (st.members.isEmpty) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) =>
          ChangeNotifierProvider.value(value: st, child: _ExpenseSheet(editing: editing)),
    );
  }

  void _openReport() {
    final st = context.read<TravelState>();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) =>
          ChangeNotifierProvider.value(value: st, child: const _FunReportSheet()),
    );
  }

  void _openSheet() {
    final st = context.read<TravelState>();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChangeNotifierProvider.value(
        value: st,
        child: const _SettlementSheetModal(),
      ),
    );
  }

  /// 分享只读链接：本地优先无后端签名，复用账本 id / serverId 作为 token，
  /// 拼出与网页端 /share/[token] 同形的可分享 URL（网页端用签名 token，
  /// 此处用 ledgerId 以便 App 内 share_page 可直接按 id 解析）。
  Future<void> _shareReadOnlyLink() async {
    setState(() {
      _shareError = '';
      _shareBusy = true;
    });
    try {
      final st = context.read<TravelState>();
      final token = st.ledger.serverId ?? st.ledger.id;
      final url = '${AppConfig.apiBaseUrl}/share/$token';
      setState(() {
        _shareUrl = url;
        _shareCopied = false;
      });
    } catch (e) {
      setState(() => _shareError = e is Exception ? e.toString() : '生成失败');
    } finally {
      if (mounted) setState(() => _shareBusy = false);
    }
  }

  Future<void> _deleteExpense(TripExpense e) async {
    final st = context.read<TravelState>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('删除「${e.title}」？'),
        content: Text(
            '${(e.amountBaseCents / 100).toStringAsFixed(2)} ${st.ledger.baseCurrency}'),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('取消')),
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('删除')),
        ],
      ),
    );
    if (ok == true) await st.deleteExpense(e);
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TravelState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;

    final base = (state.ledger.baseCurrency?.isEmpty ?? true)
        ? 'CNY'
        : state.ledger.baseCurrency!;

    // 阶段合计 / 每日 / 各币种原币合计
    var preTotal = 0;
    var duringTotal = 0;
    final daily = <String, int>{};
    final curTotals = <String, int>{};
    for (final e in state.expenses) {
      if (e.deletedAt != null) continue;
      if (e.phase == 'pre') {
        preTotal += e.amountBaseCents;
      } else {
        duringTotal += e.amountBaseCents;
      }
      final key = _ymd(DateTime.fromMillisecondsSinceEpoch(e.occurredAt));
      daily[key] = (daily[key] ?? 0) + e.amountBaseCents;
      curTotals[e.currency] = (curTotals[e.currency] ?? 0) + e.amountForeignCents;
    }

    final settlementError = state.settlementError();
    final transfers = state.settlement();
    final balances = state.balances();
    final netList = state.members
        .map((m) => _Net(m.id, m.displayName, balances[m.id] ?? 0, m.settled))
        .toList()
      ..sort((a, b) => b.netCents.compareTo(a.netCents));

    String nameOf(String id) =>
        state.members.where((m) => m.id == id).firstOrNull?.displayName ?? id;

    final startStr = state.ledger.startDate != null
        ? _ymd(DateTime.fromMillisecondsSinceEpoch(state.ledger.startDate!))
        : null;
    final endStr = state.ledger.endDate != null
        ? _ymd(DateTime.fromMillisecondsSinceEpoch(state.ledger.endDate!))
        : null;
    final phaseList = state.expenses
        .where((e) =>
            e.deletedAt == null &&
            e.phase == _phase &&
            (_dateFilter == null ||
                _ymd(DateTime.fromMillisecondsSinceEpoch(e.occurredAt)) ==
                    _dateFilter))
        .toList()
      ..sort((a, b) => b.occurredAt.compareTo(a.occurredAt));

    // 预算（多币种）
    Map<String, dynamic>? budget;
    if (state.ledger.tripBudget != null) {
      try {
        final decoded = jsonDecode(state.ledger.tripBudget!);
        if (decoded is Map) budget = Map<String, dynamic>.from(decoded);
      } catch (_) {
        budget = null;
      }
    }
    final totalBaseCents = budget?['totalBaseCents'] as int?;
    final perCurRaw = budget?['perCurrency'];
    final perCur = <String, int>{};
    if (perCurRaw is Map) {
      for (final k in perCurRaw.keys) {
        final v = perCurRaw[k];
        if (v is num) perCur[k.toString()] = v.toInt();
      }
    }
    final hasBudget = totalBaseCents != null || perCur.isNotEmpty;

    return Container(
      color: pageBg,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PageHeader(
                icon: state.ledger.icon ?? '✈️',
                title: state.ledger.displayName,
                subtitle: '',
                actions: [
                  if (state.pending > 0) _PendingBadge(count: state.pending),
                  IconButton(
                    icon: const Text('⚙', style: TextStyle(fontSize: 20)),
                    tooltip: '设置',
                    onPressed: _openSettings,
                  ),
                  TextButton(
                    onPressed: _openMembers,
                    child: Text('同伴',
                        style: TextStyle(color: ink500, fontSize: 13)),
                  ),
                ],
              ),
              _SummaryCard(
                baseCurrency: base,
                total: preTotal + duringTotal,
                preTotal: preTotal,
                duringTotal: duringTotal,
                startStr: startStr,
                endStr: endStr,
                memberCount: state.members.length,
              ),
              const SizedBox(height: 16),
              AppCard(
                radius: 24,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: _TripDailyChart(daily: daily, baseCurrency: base),
                ),
              ),
              if (hasBudget) ...[
                const SizedBox(height: 16),
                _BudgetCard(
                  baseCurrency: base,
                  spentBase: preTotal + duringTotal,
                  totalBaseCents: totalBaseCents,
                  curTotals: curTotals,
                  perCurrency: perCur,
                ),
              ],
              const SizedBox(height: 16),
              // 阶段切换
              Row(
                children: [
                  Expanded(
                    child: _PhaseButton(
                      label: '行前',
                      cents: preTotal,
                      baseCurrency: base,
                      selected: _phase == 'pre',
                      onTap: () => _pickPhase('pre'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _PhaseButton(
                      label: '行中',
                      cents: duringTotal,
                      baseCurrency: base,
                      selected: _phase == 'during',
                      onTap: () => _pickPhase('during'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => setState(() => _showCalendar = !_showCalendar),
                  child: Text(_showCalendar ? '收起行程日历' : '📅 行程日历'),
                ),
              ),
              if (_showCalendar)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: AppCard(
                    radius: 24,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                    child: _TripCalendar(
                      baseCurrency: base,
                      daily: daily,
                        startDate: state.ledger.startDate != null
                            ? _ymd(DateTime.fromMillisecondsSinceEpoch(
                                state.ledger.startDate!))
                            : null,
                        endDate: state.ledger.endDate != null
                            ? _ymd(DateTime.fromMillisecondsSinceEpoch(
                                state.ledger.endDate!))
                            : null,
                        activeDate: _dateFilter,
                        onPickDay: _pickDay,
                      ),
                    ),
                  ),
                ),
              if (_dateFilter != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => setState(() => _dateFilter = null),
                      child: Text('筛选中：$_dateFilter · 点此清除'),
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              AppPrimaryButton(
                label: state.members.isEmpty ? '请先添加成员' : '+ 记一笔',
                onPressed:
                    state.members.isEmpty ? null : () => _openExpense(null),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _shareBusy ? null : _shareReadOnlyLink,
                  child: Text(_shareBusy ? '生成中…' : '🔗 分享只读链接'),
                ),
              ),
              if (_shareError.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(_shareError,
                      style: const TextStyle(
                          color: AppColors.lightSemanticRed, fontSize: 12)),
                ),
              if (_shareUrl != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: surface,
                    border: Border.all(color: border, width: 1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text('🔗 只读分享页 · 数据仅供查看，无法修改',
                      style: TextStyle(color: ink500, fontSize: 13)),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: surface,
                    border: Border.all(color: border, width: 1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                          '把链接发给同伴，对方无需登录即可查看本账本的趣味报告与结算单：',
                          style: TextStyle(color: ink500, fontSize: 12)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 8),
                              decoration: BoxDecoration(
                                color: pageBg,
                                border: Border.all(color: border, width: 1),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(_shareUrl!,
                                  style: TextStyle(color: ink500, fontSize: 11),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis),
                            ),
                          ),
                          const SizedBox(width: 8),
                          TextButton(
                            onPressed: () async {
                              await Clipboard.setData(
                                  ClipboardData(text: _shareUrl!));
                              setState(() => _shareCopied = true);
                              Future.delayed(
                                  const Duration(milliseconds: 1500), () {
                                if (mounted) {
                                  setState(() => _shareCopied = false);
                                }
                              });
                            },
                            child: Text(_shareCopied ? '已复制' : '复制',
                                style: TextStyle(color: ink900, fontSize: 13)),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 16),
              const SectionLabel('旅行记录'),
              if (phaseList.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Center(
                    child: Text('此阶段还没有记录',
                        style: TextStyle(color: ink400, fontSize: 13)),
                  ),
                )
              else
                ...phaseList.map((e) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _ExpenseTile(
                        expense: e,
                        baseCurrency: base,
                        members: state.members,
                        splits: state.splitsByExpense[e.id] ?? const [],
                        onEdit: () => _openExpense(e),
                        onDelete: () => _deleteExpense(e),
                      ),
                    )),
              if (settlementError != null) ...[
                const SizedBox(height: 16),
                _SettlementErrorCard(text: settlementError),
              ],
              if (transfers.isNotEmpty) ...[
                const SizedBox(height: 16),
                _SettlementCard(
                  baseCurrency: base,
                  netList: netList,
                  transfers: transfers,
                  nameOf: nameOf,
                  onToggleSettled: (memberId, next) async {
                    final m = state.members
                        .where((x) => x.id == memberId)
                        .firstOrNull;
                    if (m != null) await state.setSettled(m, next);
                  },
                  onReport: _openReport,
                  onExportSheet: _openSheet,
                ),
              ],
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.baseCurrency,
    required this.total,
    required this.preTotal,
    required this.duringTotal,
    this.startStr,
    this.endStr,
    required this.memberCount,
  });

  final String baseCurrency;
  final int total;
  final int preTotal;
  final int duringTotal;
  final String? startStr;
  final String? endStr;
  final int memberCount;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;

    return AppCard(
      radius: 24,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$baseCurrency · 已花费',
                style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 4),
            Money(
              cents: total,
              style: TextStyle(
                  color: ink900, fontSize: 34, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: border, width: 1),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('行前', style: TextStyle(color: ink500, fontSize: 12)),
                        const SizedBox(height: 2),
                        Money(cents: preTotal,
                            style: TextStyle(
                                color: ink900,
                                fontSize: 15,
                                fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: border, width: 1),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('行中', style: TextStyle(color: ink500, fontSize: 12)),
                        const SizedBox(height: 2),
                        Money(cents: duringTotal,
                            style: TextStyle(
                                color: ink900,
                                fontSize: 15,
                                fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              <String>[
                if (startStr != null && endStr != null) '开始 $startStr · 结束 $endStr',
                '$memberCount 位成员',
              ].join(' · '),
              style: TextStyle(color: ink500, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhaseButton extends StatelessWidget {
  const _PhaseButton({
    required this.label,
    required this.cents,
    required this.baseCurrency,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int cents;
  final String baseCurrency;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final fill = selected
        ? (isDark ? AppColors.darkInk100 : AppColors.lightInk900)
        : (isDark ? AppColors.darkSurface : const Color(0xFFF1F5F9));
    final textColor = selected
        ? (isDark ? AppColors.darkInk900 : Colors.white)
        : ink500;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Center(
          child: RichText(
            text: TextSpan(
              style: TextStyle(color: textColor, fontSize: 14),
              children: [
                TextSpan(text: '$label · '),
                TextSpan(
                  text: money.Money.formatPlain(cents),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// 每日花费柱状图（零依赖，纯 Container 条形）。
class _TripDailyChart extends StatelessWidget {
  const _TripDailyChart({required this.daily, required this.baseCurrency});

  final Map<String, int> daily;
  final String baseCurrency;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final green =
        isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;

    if (daily.isEmpty) {
      return Text('还没有花费记录',
          style: TextStyle(color: ink500, fontSize: 12));
    }
    final entries = daily.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    final max = entries.map((e) => e.value).reduce((a, b) => a > b ? a : b);
    final total = entries.fold(0, (s, e) => s + e.value);
    const barH = 100.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('每日花费（$baseCurrency）',
                    style: TextStyle(color: ink500, fontSize: 13)),
                const SizedBox(height: 2),
                Text('峰值 ${money.Money.formatPlain(max)}',
                    style: TextStyle(color: ink500, fontSize: 11)),
              ],
            ),
            Text('合计 ${money.Money.formatPlain(total)}',
                style: TextStyle(
                    color: isDark
                        ? AppColors.darkInk400
                        : AppColors.lightInk700,
                    fontSize: 13,
                    fontWeight: FontWeight.w600)),
          ],
        ),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final e in entries) ...[
                Column(
                  children: [
                    Container(
                      width: 18,
                      height: barH,
                      alignment: Alignment.bottomCenter,
                      child: Container(
                        width: 18,
                        height: max > 0 ? (e.value / max * barH) : 0,
                        decoration: BoxDecoration(
                          color: e.value > 0
                              ? green
                              : (isDark ? Colors.grey.shade700 : Colors.grey.shade300),
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(e.key.substring(5),
                        style: TextStyle(color: ink500, fontSize: 9)),
                  ],
                ),
                const SizedBox(width: 6),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _BudgetBar extends StatelessWidget {
  const _BudgetBar({
    required this.label,
    required this.currency,
    required this.spent,
    required this.limit,
  });

  final String label;
  final String currency;
  final int spent;
  final int limit;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ratio = limit > 0 ? (spent / limit).clamp(0.0, 1.0) : 0.0;
    final over = spent > limit;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: TextStyle(color: ink500, fontSize: 12)),
              Text(
                '${money.Money.formatPlain(spent)} / ${money.Money.formatPlain(limit)} $currency',
                style: TextStyle(
                    color: over ? AppColors.lightSemanticRed : ink500,
                    fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Container(
            height: 8,
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
              borderRadius: BorderRadius.circular(999),
            ),
            child: FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: ratio,
              child: Container(
                decoration: BoxDecoration(
                  color: over
                      ? AppColors.lightSemanticRed
                      : (isDark
                          ? AppColors.darkSemanticGreen
                          : AppColors.lightSemanticGreen),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
          ),
          if (over)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                '已超支 ${money.Money.formatPlain(spent - limit)} $currency',
                style: const TextStyle(color: AppColors.lightSemanticRed, fontSize: 10),
              ),
            ),
        ],
      ),
    );
  }
}

class _BudgetCard extends StatelessWidget {
  const _BudgetCard({
    required this.baseCurrency,
    required this.spentBase,
    required this.totalBaseCents,
    required this.curTotals,
    required this.perCurrency,
  });

  final String baseCurrency;
  final int spentBase;
  final int? totalBaseCents;
  final Map<String, int> curTotals;
  final Map<String, int> perCurrency;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    return AppCard(
      radius: 24,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('预算', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 8),
            if (totalBaseCents != null)
              _BudgetBar(
                label: '总预算（$baseCurrency）',
                currency: baseCurrency,
                spent: spentBase,
                limit: totalBaseCents!,
              ),
            for (final entry in perCurrency.entries)
              _BudgetBar(
                label: '${entry.key} 预算',
                currency: entry.key,
                spent: curTotals[entry.key] ?? 0,
                limit: entry.value,
              ),
          ],
        ),
      ),
    );
  }
}

/// 行程日历（零依赖月历网格，按金额深浅高亮）。
class _TripCalendar extends StatelessWidget {
  const _TripCalendar({
    required this.daily,
    required this.startDate,
    required this.endDate,
    required this.activeDate,
    required this.onPickDay,
    required this.baseCurrency,
  });

  final Map<String, int> daily;
  final String? startDate;
  final String? endDate;
  final String? activeDate;
  final ValueChanged<String> onPickDay;
  final String baseCurrency;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final green =
        isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;

    if (daily.isEmpty) {
      return Text('还没有花费记录',
          style: TextStyle(color: ink500, fontSize: 12));
    }

    String from;
    String to;
    if (startDate != null && endDate != null) {
      from = startDate!;
      to = endDate!;
    } else {
      final keys = daily.keys.toList()..sort();
      from = keys.first;
      to = keys.last;
    }

    final fromD = _parseDate(from);
    final toD = _parseDate(to);
    if (fromD == null || toD == null) {
      return Text('日期数据异常', style: TextStyle(color: ink500, fontSize: 12));
    }

    final months = <DateTime>[];
    var cur = DateTime(fromD.year, fromD.month, 1);
    final last = DateTime(toD.year, toD.month, 1);
    while (cur.compareTo(last) <= 0) {
      months.add(cur);
      cur = DateTime(cur.year, cur.month + 1, 1);
    }
    final maxC = daily.values.reduce((a, b) => a > b ? a : b);

    Widget dayCell(String key, int day, int cents, double ratio, bool isActive) {
      final has = cents > 0;
      return InkWell(
        onTap: has ? () => onPickDay(key) : null,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          margin: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(6),
            border: isActive ? Border.all(color: green, width: 2) : null,
            color: has
                ? Color.fromRGBO(
                    4, 158, 105, (0.12 + 0.55 * ratio).clamp(0.0, 1.0))
                : null,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '$day',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: has ? FontWeight.w600 : FontWeight.normal,
                  color: has ? const Color(0xFF065F46) : ink400,
                ),
              ),
              if (has)
                Text(_compactYuan(cents),
                    style: const TextStyle(fontSize: 9, color: Color(0xFF065F46))),
            ],
          ),
        ),
      );
    }

    final week = ['一', '二', '三', '四', '五', '六', '日'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('行程日历（$baseCurrency）',
                style: TextStyle(color: ink500, fontSize: 12)),
            Text('点有记录的日期可筛选列表',
                style: TextStyle(color: ink400, fontSize: 10)),
          ],
        ),
        const SizedBox(height: 8),
        for (final mo in months) ...[
          Text('${mo.year} 年 ${mo.month} 月',
              style: TextStyle(color: ink500, fontSize: 12)),
          const SizedBox(height: 4),
          Row(
            children: week
                .map((w) => Expanded(
                      child: Center(
                        child: Text(w,
                            style: TextStyle(color: ink400, fontSize: 10)),
                      ),
                    ))
                .toList(),
          ),
          const SizedBox(height: 2),
          GridView.count(
            crossAxisCount: 7,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 2,
            crossAxisSpacing: 2,
            childAspectRatio: 1.15,
            children: [
              for (var i = 0; i < (mo.weekday - 1) % 7; i++) const SizedBox.shrink(),
              for (var d = 1; d <= DateTime(mo.year, mo.month + 1, 0).day; d++) ...[
                Builder(builder: (_) {
                  final key =
                      '${mo.year}-${_pad2(mo.month)}-${_pad2(d)}';
                  final cents = daily[key] ?? 0;
                  final ratio = maxC > 0 ? cents / maxC : 0.0;
                  return dayCell(key, d, cents, ratio, activeDate == key);
                }),
              ],
            ],
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _ExpenseTile extends StatelessWidget {
  const _ExpenseTile({
    required this.expense,
    required this.baseCurrency,
    required this.members,
    required this.splits,
    required this.onEdit,
    required this.onDelete,
  });

  final TripExpense expense;
  final String baseCurrency;
  final List<TripMember> members;
  final List<TripSplit> splits;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk500;

    final payer =
        members.where((m) => m.id == expense.payerId).firstOrNull?.displayName ??
            '?';
    final shareByMember = splits
        .map((s) {
          final name = members
                  .where((m) => m.id == s.memberId)
                  .firstOrNull
                  ?.displayName ??
              s.memberId;
          return '$name ${money.Money.formatPlain(s.shareCents)}';
        })
        .join(' · ');

    final showForeign =
        expense.currency.toUpperCase() != baseCurrency.toUpperCase();

    return AppCard(
      radius: 16,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(expense.title,
                      style: TextStyle(color: ink900, fontSize: 14, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(
                    '${_fmtDateTime(expense.occurredAt)} · $payer 垫付 · ${expense.category}',
                    style: TextStyle(color: ink500, fontSize: 11),
                  ),
                  if (shareByMember.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text('分摊：$shareByMember',
                          style: TextStyle(color: ink500, fontSize: 11)),
                    ),
                  if (expense.note != null && expense.note!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text('备注：${expense.note}',
                          style: TextStyle(color: ink500, fontSize: 11)),
                    ),
                  if (expense.imageUrls.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Wrap(
                        spacing: 6,
                        children: [
                          for (final url in expense.imageUrls)
                            InkWell(
                              onTap: () => _zoomTravelImage(
                                  context,
                                  expense.imageUrls,
                                  expense.imageUrls.indexOf(url)),
                              borderRadius: BorderRadius.circular(8),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.network(
                                  url,
                                  width: 36,
                                  height: 36,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Container(
                                    width: 36,
                                    height: 36,
                                    color: ink400.withOpacity(0.2),
                                    child: Icon(Icons.image,
                                        size: 16, color: ink400),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Money(cents: expense.amountBaseCents,
                    style: TextStyle(color: ink900, fontSize: 15)),
                Text(baseCurrency,
                    style: TextStyle(color: ink500, fontSize: 11)),
                if (showForeign)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      '${(expense.amountForeignCents / 100).toStringAsFixed(2)} ${expense.currency}\n@ ${expense.rate.toStringAsFixed(4)}',
                      textAlign: TextAlign.right,
                      style: TextStyle(color: ink400, fontSize: 10),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 4),
            Column(
              children: [
                IconButton(
                  icon: const Text('✎', style: TextStyle(fontSize: 14)),
                  tooltip: '编辑',
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: onEdit,
                ),
                IconButton(
                  icon: const Text('✕', style: TextStyle(fontSize: 14)),
                  tooltip: '删除',
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: onDelete,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PendingBadge extends StatelessWidget {
  final int count;
  const _PendingBadge({required this.count});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final pink = isDark ? AppColors.darkBrandPink : AppColors.lightBrandPink;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: pink.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: pink.withOpacity(0.4)),
      ),
      child: Text(
        '待处理 $count',
        style: TextStyle(
          color: pink,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _SettlementErrorCard extends StatelessWidget {
  const _SettlementErrorCard({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final titleColor =
        isDark ? const Color(0xFFFCD34D) : const Color(0xFF92400E);
    final detailColor =
        isDark ? const Color(0xFFFDE68A) : const Color(0xFFB45309);
    final bg = isDark
        ? const Color(0x33F59E0B)
        : const Color(0xFFFFFBEB);
    final border = isDark
        ? const Color(0x66F59E0B)
        : const Color(0xFFFDE68A);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: border, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('结算暂时算不出来',
              style: TextStyle(
                  color: titleColor, fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(text,
              style: TextStyle(color: detailColor, fontSize: 11, height: 1.5)),
        ],
      ),
    );
  }
}

class _SettlementCard extends StatelessWidget {
  const _SettlementCard({
    required this.baseCurrency,
    required this.netList,
    required this.transfers,
    required this.nameOf,
    required this.onToggleSettled,
    required this.onReport,
    required this.onExportSheet,
  });

  final String baseCurrency;
  final List<_Net> netList;
  final List<({String fromId, String toId, int amountCents})> transfers;
  final String Function(String) nameOf;
  final Future<void> Function(String memberId, bool next) onToggleSettled;
  final VoidCallback onReport;
  final VoidCallback onExportSheet;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final green =
        isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;
    final bg = isDark
        ? const Color(0x33EC4899)
        : const Color(0xFFECFDF5);
    final border = isDark
        ? const Color(0x66EC4899)
        : const Color(0xFFA7F3D0);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: border, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('最优结算（${transfers.length} 笔转账）',
              style: TextStyle(
                  color: isDark ? green : const Color(0xFF047857),
                  fontSize: 13,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          for (final b in netList) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(b.name,
                              style: TextStyle(color: ink900, fontSize: 13),
                              overflow: TextOverflow.ellipsis),
                        ),
                        if (b.settled)
                          Container(
                            margin: const EdgeInsets.only(left: 6),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              color: isDark
                                  ? const Color(0x33999999)
                                  : const Color(0xFFD1FAE5),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text('已结清',
                                style: TextStyle(
                                    color: isDark
                                        ? green
                                        : const Color(0xFF047857),
                                    fontSize: 10)),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    b.netCents > 0
                        ? '应收'
                        : b.netCents < 0
                            ? '应付'
                            : '已平',
                    style: TextStyle(color: ink500, fontSize: 11),
                  ),
                  const SizedBox(width: 4),
                  Money(cents: b.netCents,
                      sign: true,
                      style: TextStyle(
                        color: b.netCents > 0
                            ? green
                            : (b.netCents < 0
                                ? AppColors.lightSemanticRed
                                : ink500),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      )),
                  const SizedBox(width: 8),
                  InkWell(
                    onTap: () => onToggleSettled(b.memberId, !b.settled),
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: b.settled
                            ? green
                            : (isDark
                                ? AppColors.darkBorder
                                : const Color(0xFFE2E8F0)),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        b.settled ? '✓ 已结清' : '标记结清',
                        style: TextStyle(
                          color: b.settled
                              ? Colors.white
                              : (isDark
                                  ? AppColors.darkInk100
                                  : AppColors.lightInk900),
                          fontSize: 11,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 8),
          for (final t in transfers)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('${nameOf(t.fromId)} → ${nameOf(t.toId)}',
                      style: TextStyle(color: ink900, fontSize: 14)),
                  Money(cents: t.amountCents,
                      style: TextStyle(
                          color: green,
                          fontSize: 14,
                          fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: onReport,
              style: ElevatedButton.styleFrom(
                backgroundColor: green,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('生成趣味报告'),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: onExportSheet,
              style: ElevatedButton.styleFrom(
                backgroundColor: ink900,
                foregroundColor:
                    isDark ? AppColors.darkInk900 : AppColors.lightSurface,
                elevation: 0,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('生成结算单（图片分享）'),
            ),
          ),
        ],
      ),
    );
  }
}

/// 结算单弹窗（对应网页端 SettlementSheet.tsx）。把全量结算数据渲染成一张
/// 自包含卡片，用 RepaintBoundary 截图导出 PNG（零额外依赖，离线可用），
/// 保存到应用文档目录并提示路径。
class _SettlementSheetModal extends StatefulWidget {
  const _SettlementSheetModal();

  @override
  State<_SettlementSheetModal> createState() => _SettlementSheetModalState();
}

class _SettlementSheetModalState extends State<_SettlementSheetModal> {
  final GlobalKey _repaintKey = GlobalKey();
  bool _busy = false;

  Future<void> _saveImage() async {
    setState(() => _busy = true);
    try {
      final boundary = _repaintKey.currentContext?.findRenderObject()
          as RenderRepaintBoundary?;
      if (boundary == null) throw Exception('结算单尚未渲染');
      final image = await boundary.toImage(pixelRatio: 2);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      if (byteData == null) throw Exception('图片数据生成失败');
      final bytes = byteData.buffer.asUint8List();
      final dir = await getApplicationDocumentsDirectory();
      final ledgerName = context
          .read<TravelState>()
          .ledger
          .name
          .replaceAll(RegExp(r'[^\w一-龥]+'), '_');
      final file = File('${dir.path}/${ledgerName}_结算单.png');
      await file.writeAsBytes(bytes);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('已导出结算单图片：${file.path}',
                style: const TextStyle(fontSize: 12)),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('导出失败：${e is Exception ? e.toString() : '未知错误'}',
                style: const TextStyle(fontSize: 12)),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final st = context.watch<TravelState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;

    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.92,
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 16, 16, 8),
            child: Row(
              children: [
                Text('结算单',
                    style: TextStyle(
                        color: ink900, fontSize: 16, fontWeight: FontWeight.w500)),
                const Spacer(),
                IconButton(
                  icon: const Text('✕', style: TextStyle(fontSize: 16)),
                  tooltip: '关闭',
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                children: [
                  RepaintBoundary(
                    key: _repaintKey,
                    child: _SettlementSheetContent(st: st),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: _busy ? null : _saveImage,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: ink900,
                            foregroundColor: isDark
                                ? AppColors.darkInk900
                                : AppColors.lightSurface,
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14)),
                          ),
                          child: Text(_busy ? '生成中…' : '保存图片'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: _busy ? null : _saveImage,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: green,
                            foregroundColor: AppColors.lightSurface,
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14)),
                          ),
                          child: const Text('分享'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text('导出为 PNG，可保存到相册或直接分享给同伴',
                      style: TextStyle(color: ink900, fontSize: 11)),
                  const SizedBox(height: 8),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 结算单内容（对齐网页端 SettlementSheet.tsx 的 SVG 布局）。
/// 始终用浅色 token 渲染，保证导出的 PNG 清晰可读。
class _SettlementSheetContent extends StatelessWidget {
  const _SettlementSheetContent({required this.st});

  final TravelState st;

  @override
  Widget build(BuildContext context) {
    final ledger = st.ledger;
    final base =
        (ledger.baseCurrency?.isEmpty ?? true) ? 'CNY' : ledger.baseCurrency!;
    final members = st.members;
    final expenses = st.expenses.where((e) => e.deletedAt == null).toList();

    String nameOf(String id) =>
        members.where((m) => m.id == id).firstOrNull?.displayName ?? id;

    final startStr = ledger.startDate != null
        ? _ymd(DateTime.fromMillisecondsSinceEpoch(ledger.startDate!))
        : null;
    final endStr = ledger.endDate != null
        ? _ymd(DateTime.fromMillisecondsSinceEpoch(ledger.endDate!))
        : null;
    final range = [startStr, endStr].whereType<String>().join('  ~  ');

    final byDate = <String, List<TripExpense>>{};
    for (final e in expenses) {
      final d = _ymd(DateTime.fromMillisecondsSinceEpoch(e.occurredAt));
      (byDate[d] ??= []).add(e);
    }
    final dates = byDate.keys.toList()..sort();

    final totalSpent = expenses.fold(0, (s, e) => s + e.amountBaseCents);

    final curMap = <String, int>{};
    for (final e in expenses) {
      curMap[e.currency] = (curMap[e.currency] ?? 0) + e.amountForeignCents;
    }
    final curEntries = curMap.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));

    final balances = st.balances();
    final transfers = st.settlement();
    final error = st.settlementError();

    const ink900 = AppColors.lightInk900;
    const ink500 = AppColors.lightInk500;
    const ink400 = AppColors.lightInk400;
    const accent = AppColors.lightSemanticGreen;
    const border = AppColors.lightBorder;
    const pos = AppColors.lightSemanticGreen;

    final now = DateTime.now();
    final footer = '生成于 ${_ymd(now)}';

    return Container(
      color: AppColors.lightPageBg,
      padding: const EdgeInsets.all(20),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.lightSurface,
          border: Border.all(color: border, width: 1),
          borderRadius: BorderRadius.circular(16),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${ledger.icon ?? '✈️'} ${ledger.name}',
                style: const TextStyle(
                    color: ink900, fontSize: 22, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(range.isNotEmpty ? '旅游 AA 结算单 · $range' : '旅游 AA 结算单',
                style: const TextStyle(color: ink500, fontSize: 13)),
            const SizedBox(height: 12),
            Divider(color: border, height: 1, thickness: 1),
            const SizedBox(height: 12),
            Text('账目明细（${expenses.length} 笔）',
                style: const TextStyle(
                    color: accent, fontSize: 15, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            if (dates.isEmpty)
              const Text('还没有任何记录',
                  style: TextStyle(color: ink500, fontSize: 13))
            else
              for (final d in dates) ...[
                const SizedBox(height: 6),
                Text('$d 周${_weekday(d)}',
                    style: const TextStyle(
                        color: accent,
                        fontSize: 13,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                for (final e in byDate[d]!) ...[
                  Row(
                    children: [
                      Expanded(
                        child: Text(_trunc(e.title, 20),
                            style: const TextStyle(color: ink900, fontSize: 14)),
                      ),
                      const SizedBox(width: 8),
                      Money(
                          cents: e.amountBaseCents,
                          style: const TextStyle(color: ink900, fontSize: 14)),
                      const SizedBox(width: 4),
                      Text(base,
                          style: const TextStyle(color: ink400, fontSize: 11)),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${_trunc(e.category, 8)} · ${nameOf(e.payerId)}垫付'
                    '${e.currency != base ? ' · ${money.Money.formatPlain(e.amountForeignCents)} ${e.currency}' : ''}',
                    style: const TextStyle(color: ink500, fontSize: 12),
                  ),
                  const SizedBox(height: 6),
                ],
              ],
            const SizedBox(height: 12),
            Divider(color: border, height: 1, thickness: 1),
            const SizedBox(height: 12),
            Text('总账单',
                style: const TextStyle(
                    color: accent, fontSize: 15, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Row(
              children: [
                const Text('总花费',
                    style: TextStyle(
                        color: ink900,
                        fontSize: 16,
                        fontWeight: FontWeight.w600)),
                const Spacer(),
                Money(
                    cents: totalSpent,
                    style: const TextStyle(
                        color: ink900,
                        fontSize: 16,
                        fontWeight: FontWeight.w600)),
                const SizedBox(width: 4),
                Text(base, style: const TextStyle(color: ink400, fontSize: 12)),
              ],
            ),
            if (curEntries.length > 1)
              ...curEntries.map((c) => Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Row(
                      children: [
                        Text('${c.key} 原币合计',
                            style: const TextStyle(color: ink500, fontSize: 13)),
                        const Spacer(),
                        Text('${money.Money.formatPlain(c.value)} ${c.key}',
                            style: const TextStyle(color: ink500, fontSize: 13)),
                      ],
                    ),
                  )),
            const SizedBox(height: 12),
            Text('成员净额',
                style: const TextStyle(
                    color: accent, fontSize: 14, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            for (final entry in balances.entries) ...[
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${nameOf(entry.key)}${members.where((m) => m.id == entry.key).firstOrNull?.settled == true ? '  ✓已结清' : ''}',
                        style: const TextStyle(color: ink900, fontSize: 14),
                      ),
                    ),
                    Text(
                      entry.value > 0
                          ? '应收'
                          : entry.value < 0
                              ? '应付'
                              : '已平',
                      style: const TextStyle(color: ink500, fontSize: 13),
                    ),
                    const SizedBox(width: 6),
                    Money(
                      cents: entry.value.abs(),
                      style: TextStyle(
                          color: entry.value > 0 ? pos : ink900,
                          fontSize: 14,
                          fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(width: 4),
                    Text(base,
                        style: const TextStyle(color: ink400, fontSize: 11)),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            Divider(color: border, height: 1, thickness: 1),
            const SizedBox(height: 12),
            Text('最优结算',
                style: const TextStyle(
                    color: accent, fontSize: 14, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            if (error != null)
              const Text(
                  '部分记录分摊不守恒，暂无法生成转账清单（请在账本内逐笔编辑保存修正）',
                  style: TextStyle(color: ink500, fontSize: 13))
            else if (transfers.isEmpty)
              const Text('无需转账，大家已平',
                  style: TextStyle(color: ink500, fontSize: 13))
            else
              for (final t in transfers)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text('${nameOf(t.fromId)} → ${nameOf(t.toId)}',
                            style: const TextStyle(color: ink900, fontSize: 14)),
                      ),
                      Money(
                        cents: t.amountCents,
                        style: const TextStyle(
                            color: ink900,
                            fontSize: 14,
                            fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(width: 4),
                      Text(base,
                          style: const TextStyle(color: ink400, fontSize: 11)),
                    ],
                  ),
                ),
            const SizedBox(height: 12),
            Divider(color: border, height: 1, thickness: 1),
            const SizedBox(height: 12),
            Text(footer, style: const TextStyle(color: ink500, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}

/// 成员管理弹窗（对应 TripMembersModal）。
class _MembersSheet extends StatefulWidget {
  const _MembersSheet();

  @override
  State<_MembersSheet> createState() => _MembersSheetState();
}

class _MembersSheetState extends State<_MembersSheet> {
  bool _modeUser = false;
  final _value = TextEditingController();
  String _error = '';
  bool _busy = false;

  Future<void> _add() async {
    final v = _value.text.trim();
    if (v.isEmpty) return;
    setState(() {
      _error = '';
      _busy = true;
    });
    try {
      final st = context.read<TravelState>();
      await st.addMember(
        username: _modeUser ? v : null,
        displayName: _modeUser ? null : v,
      );
      _value.clear();
    } catch (e) {
      setState(() => _error = e is Exception ? e.toString() : '添加失败（需联网）');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _del(TripMember m) async {
    setState(() => _error = '');
    try {
      await context.read<TravelState>().deleteMember(m);
    } catch (e) {
      setState(() => _error = e is Exception ? e.toString() : '删除失败');
    }
  }

  Future<void> _toggle(TripMember m) async {
    setState(() => _error = '');
    try {
      await context.read<TravelState>().setSettled(m, !m.settled);
    } catch (e) {
      setState(() => _error = e is Exception ? e.toString() : '操作失败');
    }
  }

  @override
  void dispose() {
    _value.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TravelState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final green =
        isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;

    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 24,
        right: 24,
        top: 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('成员',
                style: TextStyle(
                    color: ink900, fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _SegBtn(
                    label: '添名字',
                    selected: !_modeUser,
                    onTap: () => setState(() => _modeUser = false),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _SegBtn(
                    label: '邀请注册用户',
                    selected: _modeUser,
                    onTap: () => setState(() => _modeUser = true),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _value,
                    maxLength: 32,
                    decoration: InputDecoration(
                      hintText: _modeUser ? '用户名' : '朋友的名字',
                      hintStyle: TextStyle(color: ink400),
                      filled: true,
                      fillColor: surface,
                      counterText: '',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide(color: border, width: 1),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide(color: border, width: 1),
                      ),
                    ),
                    onSubmitted: (_) => _add(),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _busy || _value.text.trim().isEmpty ? null : _add,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: ink900,
                      foregroundColor:
                          isDark ? AppColors.darkInk100 : Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16)),
                    ),
                    child: const Text('加'),
                  ),
                ),
              ],
            ),
            if (_error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error,
                    style: const TextStyle(
                        color: AppColors.lightSemanticRed, fontSize: 12)),
              ),
            const SizedBox(height: 16),
            if (state.members.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Center(
                  child: Text('还没有成员',
                      style: TextStyle(color: ink400, fontSize: 13)),
                ),
              )
            else
              for (final m in state.members)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: surface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: border, width: 1),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(m.displayName,
                                        style: TextStyle(
                                            color: ink900, fontSize: 14),
                                        overflow: TextOverflow.ellipsis),
                                  ),
                                  if (m.settled)
                                    Container(
                                      margin: const EdgeInsets.only(left: 6),
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 1),
                                      decoration: BoxDecoration(
                                        color: isDark
                                            ? const Color(0x33999999)
                                            : const Color(0xFFD1FAE5),
                                        borderRadius: BorderRadius.circular(999),
                                      ),
                                      child: Text('已结清',
                                          style: TextStyle(
                                              color: isDark
                                                  ? green
                                                  : const Color(0xFF047857),
                                              fontSize: 10)),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(m.userId != null ? '注册用户' : '纯名字',
                                  style: TextStyle(color: ink500, fontSize: 11)),
                            ],
                          ),
                        ),
                        InkWell(
                          onTap: () => _toggle(m),
                          borderRadius: BorderRadius.circular(10),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: m.settled
                                  ? green
                                  : (isDark
                                      ? AppColors.darkBorder
                                      : const Color(0xFFE2E8F0)),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              m.settled ? '✓ 已结清' : '标记结清',
                              style: TextStyle(
                                color: m.settled
                                    ? Colors.white
                                    : (isDark
                                        ? AppColors.darkInk100
                                        : AppColors.lightInk900),
                                fontSize: 11,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton(
                          icon: const Text('✕',
                              style: TextStyle(color: AppColors.lightSemanticRed)),
                          tooltip: '删除',
                          onPressed: () => _del(m),
                        ),
                      ],
                    ),
                  ),
                ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: OutlinedButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('完成'),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _SegBtn extends StatelessWidget {
  const _SegBtn(
      {required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final fill = selected
        ? (isDark ? AppColors.darkInk100 : AppColors.lightInk900)
        : (isDark ? AppColors.darkSurface : const Color(0xFFF1F5F9));
    final textColor = selected
        ? (isDark ? AppColors.darkInk900 : Colors.white)
        : ink500;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Center(
          child: Text(label,
              style: TextStyle(color: textColor, fontSize: 13)),
        ),
      ),
    );
  }
}

/// 添加 / 编辑花费弹窗（对应 TripExpenseModal）。
class _ExpenseSheet extends StatefulWidget {
  const _ExpenseSheet({this.editing});

  final TripExpense? editing;

  @override
  State<_ExpenseSheet> createState() => _ExpenseSheetState();
}

class _ExpenseSheetState extends State<_ExpenseSheet> {
  final _title = TextEditingController();
  final _amount = TextEditingController();
  final _rate = TextEditingController(text: '1');
  final _note = TextEditingController();
  String _category = '餐饮';
  String _phase = 'during';
  late String _currency;
  String _payerId = '';
  String _splitMode = 'even';
  final Set<String> _selected = {};
  final Map<String, int> _ratios = {};
  late int _occurredAt;
  String _error = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final e = widget.editing;
    final members =
        context.read<TravelState>().members;
    _currency = e?.currency ??
        context.read<TravelState>().ledger.baseCurrency ??
        'CNY';
    _title.text = e?.title ?? '';
    _category = e?.category ?? '餐饮';
    _phase = e?.phase ?? 'during';
    _amount.text = e != null ? (e.amountForeignCents / 100).toStringAsFixed(2) : '';
    _rate.text = e != null ? e.rate.toString() : '1';
    _note.text = e?.note ?? '';
    _occurredAt = e?.occurredAt ?? DateTime.now().millisecondsSinceEpoch;
    _payerId = e?.payerId ?? members.firstOrNull?.id ?? '';
    _splitMode = e != null ? 'ratio' : 'even';
    for (final m in members) _ratios[m.id] = 1;
    if (e != null) {
      for (final s in context.read<TravelState>().splitsByExpense[e.id] ?? const []) {
        _ratios[s.memberId] = (s.shareCents / 100).round();
        _selected.add(s.memberId);
      }
      for (final m in members) {
        if (!_selected.contains(m.id)) _ratios[m.id] = 0;
      }
    } else {
      for (final m in members) _selected.add(m.id);
    }
  }

  List<String> get _weightsIds {
    final members = context.read<TravelState>().members;
    if (_splitMode == 'even') {
      return members.map((m) => m.id).toList();
    } else if (_splitMode == 'partial') {
      return _selected.toList();
    }
    return members
        .where((m) => (_ratios[m.id] ?? 0) > 0)
        .map((m) => m.id)
        .toList();
  }

  Map<String, int> get _weights {
    final ids = _weightsIds;
    final map = <String, int>{};
    for (final id in ids) {
      final w = _splitMode == 'ratio' ? (_ratios[id] ?? 0) : 1;
      map[id] = w;
    }
    return map;
  }

  @override
  void dispose() {
    _title.dispose();
    _amount.dispose();
    _rate.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final st = context.read<TravelState>();
    final foreign = money.Money.parseToCents(_amount.text);
    final rateNum = double.tryParse(_rate.text) ?? 0;
    if (_title.text.trim().isEmpty) {
      setState(() => _error = '请填写事项');
      return;
    }
    if (foreign == null || foreign == 0) {
      setState(() => _error = '金额格式不正确');
      return;
    }
    if (!rateNum.isFinite || rateNum <= 0) {
      setState(() => _error = '汇率格式不正确');
      return;
    }
    if (_payerId.isEmpty) {
      setState(() => _error = '请选择付款人');
      return;
    }
    final ids = _weightsIds;
    if (ids.isEmpty) {
      setState(() => _error = '请选择分摊成员');
      return;
    }
    setState(() {
      _error = '';
      _busy = true;
    });
    try {
      if (widget.editing != null) {
        await st.updateExpense(
          expenseId: widget.editing!.id,
          payerLocalId: _payerId,
          title: _title.text.trim(),
          category: _category,
          phase: _phase,
          currency: _currency.toUpperCase(),
          amountForeignCents: foreign,
          rate: rateNum,
          participantLocalIds: ids,
          weights: _weights,
          note: _note.text.trim().isEmpty ? null : _note.text.trim(),
          occurredAt: _occurredAt,
        );
      } else {
        await st.addExpense(
          payerLocalId: _payerId,
          title: _title.text.trim(),
          category: _category,
          phase: _phase,
          currency: _currency.toUpperCase(),
          amountForeignCents: foreign,
          rate: rateNum,
          participantLocalIds: ids,
          weights: _weights,
          note: _note.text.trim().isEmpty ? null : _note.text.trim(),
        );
      }
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() =>
            _error = e is Exception ? e.toString() : '保存失败（请先联网同步成员）');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TravelState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final base = (state.ledger.baseCurrency?.isEmpty ?? true)
        ? 'CNY'
        : state.ledger.baseCurrency!;
    final codes = _currencyCodes(base);

    final foreign = money.Money.parseToCents(_amount.text) ?? 0;
    final rateNum = double.tryParse(_rate.text) ?? 0;
    final amountBase = (foreign * rateNum).round();
    final ids = _weightsIds;
    final shares = (amountBase > 0 && ids.isNotEmpty)
        ? TravelState.allocate(
            amountBase, ids, ids.map((id) => _weights[id] ?? 0).toList())
        : <String, int>{};

    final showForeign = _currency?.toUpperCase() != base.toUpperCase();

    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 24,
        right: 24,
        top: 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.editing != null ? '编辑记录' : '记一笔',
                style: TextStyle(
                    color: ink900, fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _SegBtn(
                    label: '行前',
                    selected: _phase == 'pre',
                    onTap: () => setState(() => _phase = 'pre'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _SegBtn(
                    label: '行中',
                    selected: _phase == 'during',
                    onTap: () => setState(() => _phase = 'during'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text('事项 *', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 4),
            TextField(
              controller: _title,
              maxLength: 100,
              decoration: InputDecoration(
                hintText: '午饭 · 门票 · 出租车…',
                hintStyle: TextStyle(color: ink400),
                counterText: '',
                filled: true,
                fillColor: surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: border, width: 1),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: border, width: 1),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text('类别', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 4),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _kCategories
                  .map((c) => InkWell(
                        onTap: () => setState(() => _category = c),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: _category == c
                                ? ink900
                                : (isDark
                                    ? AppColors.darkSurface
                                    : const Color(0xFFF1F5F9)),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: border, width: 1),
                          ),
                          child: Text(c,
                              style: TextStyle(
                                color: _category == c
                                    ? (isDark
                                        ? AppColors.darkInk100
                                        : Colors.white)
                                    : ink500,
                                fontSize: 13,
                              )),
                        ),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('金额', style: TextStyle(color: ink500, fontSize: 12)),
                      const SizedBox(height: 4),
                      TextField(
                        controller: _amount,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: InputDecoration(
                          hintText: '0.00',
                          hintStyle: TextStyle(color: ink400),
                          filled: true,
                          fillColor: surface,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide(color: border, width: 1),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide(color: border, width: 1),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('币种', style: TextStyle(color: ink500, fontSize: 12)),
                      const SizedBox(height: 4),
                      Container(
                        decoration: BoxDecoration(
                          color: surface,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: border, width: 1),
                        ),
                        child: DropdownButtonFormField<String>(
                          value: codes.contains(_currency) ? _currency : codes.first,
                          decoration: const InputDecoration(
                            border: InputBorder.none,
                            contentPadding:
                                EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          ),
                          items: codes
                              .map((c) => DropdownMenuItem(
                                  value: c, child: Text(c)))
                              .toList(),
                          onChanged: (v) => setState(() {
                            if (v != null) _currency = v;
                          }),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (showForeign)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: border, width: 1),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('汇率（1 ${_currency.toUpperCase()} = ? $base）',
                          style: TextStyle(color: ink500, fontSize: 12)),
                      const SizedBox(height: 4),
                      TextField(
                        controller: _rate,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: InputDecoration(
                          hintText: '1',
                          hintStyle: TextStyle(color: ink400),
                          filled: true,
                          fillColor: surface,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide(color: border, width: 1),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide(color: border, width: 1),
                          ),
                        ),
                      ),
                      if (amountBase > 0)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            '≈ ${money.Money.formatPlain(amountBase)} $base',
                            style: TextStyle(color: ink500, fontSize: 12),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 12),
            Text('付款人', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 4),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: state.members
                  .map((m) => InkWell(
                        onTap: () => setState(() => _payerId = m.id),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: _payerId == m.id
                                ? ink900
                                : (isDark
                                    ? AppColors.darkSurface
                                    : const Color(0xFFF1F5F9)),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: border, width: 1),
                          ),
                          child: Text(m.displayName,
                              style: TextStyle(
                                color: _payerId == m.id
                                    ? (isDark
                                        ? AppColors.darkInk100
                                        : Colors.white)
                                    : ink500,
                                fontSize: 13,
                              )),
                        ),
                      ))
                  .toList(),
            ),
            if (state.members.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('请先在「同伴」里添加成员',
                    style: TextStyle(color: ink400, fontSize: 11)),
              ),
            const SizedBox(height: 12),
            Text('分摊方式', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 4),
            Row(
              children: [
                Expanded(
                  child: _SegBtn(
                    label: '全员平摊',
                    selected: _splitMode == 'even',
                    onTap: () => setState(() => _splitMode = 'even'),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: _SegBtn(
                    label: '部分平摊',
                    selected: _splitMode == 'partial',
                    onTap: () => setState(() => _splitMode = 'partial'),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: _SegBtn(
                    label: '按比例',
                    selected: _splitMode == 'ratio',
                    onTap: () => setState(() => _splitMode = 'ratio'),
                  ),
                ),
              ],
            ),
            if (_splitMode == 'partial')
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: state.members
                      .map((m) => InkWell(
                            onTap: () => setState(() {
                              if (_selected.contains(m.id)) {
                                _selected.remove(m.id);
                              } else {
                                _selected.add(m.id);
                              }
                            }),
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: _selected.contains(m.id)
                                    ? ink900
                                    : (isDark
                                        ? AppColors.darkSurface
                                        : const Color(0xFFF1F5F9)),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: border, width: 1),
                              ),
                              child: Text(m.displayName,
                                  style: TextStyle(
                                    color: _selected.contains(m.id)
                                        ? (isDark
                                            ? AppColors.darkInk100
                                            : Colors.white)
                                        : ink500,
                                    fontSize: 13,
                                  )),
                            ),
                          ))
                      .toList(),
                ),
              ),
            if (_splitMode == 'ratio')
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Column(
                  children: state.members
                      .map((m) => Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(m.displayName,
                                      style: TextStyle(
                                          color: ink900, fontSize: 13)),
                                ),
                                SizedBox(
                                  width: 64,
                                  child: TextField(
                                    keyboardType: TextInputType.number,
                                    decoration: InputDecoration(
                                      hintText: '1',
                                      hintStyle: TextStyle(color: ink400),
                                      filled: true,
                                      fillColor: surface,
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(12),
                                        borderSide:
                                            BorderSide(color: border, width: 1),
                                      ),
                                      enabledBorder: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(12),
                                        borderSide:
                                            BorderSide(color: border, width: 1),
                                      ),
                                    ),
                                    onChanged: (v) => setState(() {
                                      _ratios[m.id] =
                                          int.tryParse(v) ?? 0;
                                    }),
                                    controller: TextEditingController(
                                        text: '${_ratios[m.id] ?? 0}'),
                                  ),
                                ),
                                const SizedBox(width: 4),
                                Text('份',
                                    style: TextStyle(
                                        color: ink500, fontSize: 12)),
                              ],
                            ),
                          ))
                      .toList(),
                ),
              ),
            if (shares.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: isDark
                        ? const Color(0x330499E6)
                        : const Color(0xFFECFDF5),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    '分摊结果：${ids.indexed.map((e) {
                      final id = e.$2;
                      final name = state.members
                              .where((m) => m.id == id)
                              .firstOrNull
                              ?.displayName ??
                          id;
                      final v = shares[id] ?? 0;
                      return '$name ${money.Money.formatPlain(v)}';
                    }).join(' · ')}',
                    style: TextStyle(
                        color: isDark
                            ? AppColors.darkSemanticGreen
                            : const Color(0xFF047857),
                        fontSize: 12),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            Text('备注', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 4),
            TextField(
              controller: _note,
              maxLength: 500,
              decoration: InputDecoration(
                hintStyle: TextStyle(color: ink400),
                counterText: '',
                filled: true,
                fillColor: surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: border, width: 1),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: border, width: 1),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text('发生时间', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 4),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate:
                        DateTime.fromMillisecondsSinceEpoch(_occurredAt),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                  );
                  if (picked != null) {
                    setState(() =>
                        _occurredAt = picked.millisecondsSinceEpoch);
                  }
                },
                child: Text(_fmtDateTime(_occurredAt)),
              ),
            ),
            if (_error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error,
                    style: const TextStyle(
                        color: AppColors.lightSemanticRed, fontSize: 12)),
              ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 52,
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('取消'),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: SizedBox(
                    height: 52,
                    child: ElevatedButton(
                      onPressed: _busy ? null : _save,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: ink900,
                        foregroundColor:
                            isDark ? AppColors.darkInk100 : Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16)),
                      ),
                      child: Text(_busy ? '保存中…' : '保存'),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

/// 账本设置弹窗（对应 TravelSettingsModal）。
class _SettingsSheet extends StatefulWidget {
  const _SettingsSheet();

  @override
  State<_SettingsSheet> createState() => _SettingsSheetState();
}

class _SettingsSheetState extends State<_SettingsSheet> {
  late TextEditingController _name;
  late TextEditingController _icon;
  late TextEditingController _totalBase;
  final _perCur = <String, String>{};
  final _perCurOrder = <String>[];
  final _perCurCtl = <String, TextEditingController>{};
  String _addCur = '';
  late String _baseCurrency;
  int? _startDateMs;
  int? _endDateMs;
  String _error = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final ledger = context.read<TravelState>().ledger;
    _name = TextEditingController(text: ledger.name);
    _icon = TextEditingController(text: ledger.icon ?? '✈️');
    _baseCurrency = (ledger.baseCurrency?.isEmpty ?? true)
        ? 'CNY'
        : ledger.baseCurrency!;
    _startDateMs = ledger.startDate;
    _endDateMs = ledger.endDate;
    _totalBase = TextEditingController();
    if (ledger.tripBudget != null) {
      try {
        final b = jsonDecode(ledger.tripBudget!);
        if (b is Map) {
          final tb = b['totalBaseCents'];
          if (tb is num) _totalBase.text = (tb / 100).toString();
          final pc = b['perCurrency'];
          if (pc is Map) {
            for (final k in pc.keys) {
              final v = pc[k];
              if (v is num) {
                final key = k.toString();
                _perCur[key] = (v / 100).toString();
                _perCurOrder.add(key);
                _perCurCtl[key] = TextEditingController(text: _perCur[key]);
              }
            }
          }
        }
      } catch (_) {
        // 忽略损坏的预算 JSON
      }
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _icon.dispose();
    _totalBase.dispose();
    for (final c in _perCurCtl.values) c.dispose();
    super.dispose();
  }

  Future<void> _pickDate(bool isStart) async {
    final initial = (isStart ? _startDateMs : _endDateMs);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial != null
          ? DateTime.fromMillisecondsSinceEpoch(initial)
          : DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() {
        if (isStart) {
          _startDateMs = picked.millisecondsSinceEpoch;
        } else {
          _endDateMs = picked.millisecondsSinceEpoch;
        }
      });
    }
  }

  void _addPerCur() {
    if (_addCur.isEmpty || _perCur.containsKey(_addCur)) return;
    setState(() {
      _perCur[_addCur] = '';
      _perCurOrder.add(_addCur);
      _perCurCtl[_addCur] = TextEditingController(text: '');
      _addCur = '';
    });
  }

  void _removePerCur(String c) {
    _perCurCtl[c]?.dispose();
    _perCurCtl.remove(c);
    _perCur.remove(c);
    _perCurOrder.remove(c);
    setState(() {});
  }

  Future<void> _save() async {
    setState(() {
      _error = '';
      _busy = true;
    });
    try {
      if (_name.text.trim().isEmpty) {
        setState(() => _error = '名称不能为空');
        return;
      }
      if (_startDateMs != null &&
          _endDateMs != null &&
          _startDateMs! > _endDateMs!) {
        setState(() => _error = '结束日期不能早于开始日期');
        return;
      }
      final totalEmpty = _totalBase.text.trim().isEmpty;
      int? totalBaseCents;
      if (!totalEmpty) {
        final n = double.tryParse(_totalBase.text);
        if (n == null || n < 0) {
          setState(() => _error = '总预算需为非负数字');
          return;
        }
        totalBaseCents = (n * 100).round();
      }
      final perCurrency = <String, int>{};
      for (final e in _perCur.entries) {
        if (e.value.trim().isEmpty) continue;
        final n = double.tryParse(e.value);
        if (n == null || n < 0) {
          setState(() => _error = '${e.key} 预算需为非负数字');
          return;
        }
        perCurrency[e.key] = (n * 100).round();
      }
      final hasBudget = !totalEmpty || perCurrency.isNotEmpty;
      final tripBudget = hasBudget
          ? jsonEncode({
              'totalBaseCents': totalBaseCents,
              'perCurrency': perCurrency,
            })
          : null;

      final st = context.read<TravelState>();
      final updated = st.ledger.copyWith(
        name: _name.text.trim(),
        icon: _icon.text.trim().isEmpty ? null : _icon.text.trim(),
        baseCurrency: _baseCurrency,
        startDate: _startDateMs,
        endDate: _endDateMs,
        tripBudget: tripBudget,
      );
      await LedgerDao().upsert(updated);
      st.applyLedger(updated);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() =>
            _error = e is Exception ? e.toString() : '保存失败');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final codes = _currencyCodes(_baseCurrency);

    final spentByCur = _curTotalsFromState();

    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 24,
        right: 24,
        top: 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('账本设置',
                style: TextStyle(
                    color: ink900, fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 16),
            Text('名称', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 4),
            _field(_name, '名称', surface, border, ink400),
            const SizedBox(height: 12),
            Text('图标（emoji）', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 4),
            _field(_icon, '✈️', surface, border, ink400, maxLen: 8),
            const SizedBox(height: 12),
            Text('本位币', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 4),
            Container(
              decoration: BoxDecoration(
                color: surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: border, width: 1),
              ),
              child: DropdownButtonFormField<String>(
                value: codes.contains(_baseCurrency) ? _baseCurrency : codes.first,
                decoration: const InputDecoration(
                  border: InputBorder.none,
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                ),
                items: codes
                    .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                    .toList(),
                onChanged: (v) => setState(() {
                  if (v != null) _baseCurrency = v;
                }),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('行程开始', style: TextStyle(color: ink500, fontSize: 12)),
                      const SizedBox(height: 4),
                      _dateBtn(_startDateMs, '选择', () => _pickDate(true),
                          surface, border, ink900, ink400),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('行程结束', style: TextStyle(color: ink500, fontSize: 12)),
                      const SizedBox(height: 4),
                      _dateBtn(_endDateMs, '选择', () => _pickDate(false),
                          surface, border, ink900, ink400),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                border: Border.all(color: border, width: 1),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('预算（多币种）',
                      style: TextStyle(color: ink500, fontSize: 12)),
                  const SizedBox(height: 8),
                  Text('总预算（$_baseCurrency）',
                      style: TextStyle(color: ink500, fontSize: 11)),
                  const SizedBox(height: 4),
                  _field(_totalBase, '不限制', surface, border, ink400,
                      isNumber: true),
                  const SizedBox(height: 12),
                  Text('各币种预算（按原币，留空=不限制）',
                      style: TextStyle(color: ink500, fontSize: 11)),
                  const SizedBox(height: 8),
                  for (final c in _perCurOrder)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(
                        children: [
                          SizedBox(
                            width: 48,
                            child: Text(c,
                                style: TextStyle(color: ink900, fontSize: 13)),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _field(
                              _perCurCtl[c]!,
                              '不限制',
                              surface,
                              border,
                              ink400,
                              isNumber: true,
                              onChanged: (v) => setState(() => _perCur[c] = v),
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (spentByCur.containsKey(c))
                            Text(
                              '已花 ${(spentByCur[c]! / 100).toStringAsFixed(0)}',
                              style: TextStyle(color: ink400, fontSize: 10),
                            ),
                          IconButton(
                            icon: const Text('✕',
                                style: TextStyle(
                                    color: AppColors.lightSemanticRed)),
                            tooltip: '移除',
                            onPressed: () => _removePerCur(c),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Container(
                          decoration: BoxDecoration(
                            color: surface,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: border, width: 1),
                          ),
                          child: DropdownButtonFormField<String>(
                            value: _addCur.isEmpty ? null : _addCur,
                            hint: Text('＋ 添加币种预算…',
                                style: TextStyle(color: ink400)),
                            decoration: const InputDecoration(
                              border: InputBorder.none,
                              contentPadding: EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 4),
                            ),
                            items: codes
                                .where((c) =>
                                    c != _baseCurrency &&
                                    !_perCur.containsKey(c))
                                .map((c) => DropdownMenuItem(
                                    value: c, child: Text(c)))
                                .toList(),
                            onChanged: (v) => setState(() {
                              if (v != null) _addCur = v;
                            }),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        height: 52,
                        child: ElevatedButton(
                          onPressed: _addCur.isEmpty ? null : _addPerCur,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: ink900,
                            foregroundColor:
                                isDark ? AppColors.darkInk100 : Colors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16)),
                          ),
                          child: const Text('添加'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (_error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error,
                    style: const TextStyle(
                        color: AppColors.lightSemanticRed, fontSize: 12)),
              ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 52,
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('取消'),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: SizedBox(
                    height: 52,
                    child: ElevatedButton(
                      onPressed: _busy ? null : _save,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: ink900,
                        foregroundColor:
                            isDark ? AppColors.darkInk100 : Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16)),
                      ),
                      child: Text(_busy ? '保存中…' : '保存'),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Map<String, int> _curTotalsFromState() {
    final map = <String, int>{};
    for (final e in context.read<TravelState>().expenses) {
      if (e.deletedAt != null) continue;
      map[e.currency] = (map[e.currency] ?? 0) + e.amountForeignCents;
    }
    return map;
  }

  Widget _field(
    TextEditingController controller,
    String hint,
    Color surface,
    Color border,
    Color ink400, {
    bool isNumber = false,
    int? maxLen,
    void Function(String)? onChanged,
  }) {
    return TextField(
      controller: controller,
      maxLength: maxLen,
      onChanged: onChanged,
      keyboardType: isNumber
          ? const TextInputType.numberWithOptions(decimal: true)
          : null,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: ink400),
        counterText: '',
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: border, width: 1),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: border, width: 1),
        ),
      ),
    );
  }

  Widget _dateBtn(
    int? ms,
    String hint,
    VoidCallback onTap,
    Color surface,
    Color border,
    Color ink900,
    Color ink400,
  ) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        onPressed: onTap,
        child: Text(
          ms != null ? _md(ms) : hint,
          style: TextStyle(color: ms != null ? ink900 : ink400),
        ),
      ),
    );
  }
}

/// 趣味复盘报告弹窗（对应 TripFunReport）。
class _FunReportSheet extends StatelessWidget {
  const _FunReportSheet();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TravelState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk500;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final green =
        isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;
    final base = (state.ledger.baseCurrency?.isEmpty ?? true)
        ? 'CNY'
        : state.ledger.baseCurrency!;
    final expenses =
        state.expenses.where((e) => e.deletedAt == null).toList();
    final total = expenses.fold(0, (s, e) => s + e.amountBaseCents);

    final paid = <String, int>{};
    for (final m in state.members) paid[m.id] = 0;
    for (final e in expenses) {
      for (final s in state.splitsByExpense[e.id] ?? const <TripSplit>[]) {
        paid[s.memberId] = (paid[s.memberId] ?? 0) + s.shareCents;
      }
    }
    final sortedPaid = paid.entries
        .map((e) => _Net(
              e.key,
              state.members
                      .where((m) => m.id == e.key)
                      .firstOrNull
                      ?.displayName ??
                  e.key,
              e.value,
              false,
            ))
        .toList()
      ..sort((a, b) => b.netCents.compareTo(a.netCents));
    final bigSpender = sortedPaid.isNotEmpty ? sortedPaid.first : null;
    final cheapSkate = sortedPaid.length > 1 ? sortedPaid.last : null;

    final priciest = expenses.isEmpty
        ? null
        : (expenses.toList()
              ..sort((a, b) => b.amountBaseCents.compareTo(a.amountBaseCents)))
            .first;
    final byDay = <String, int>{};
    for (final e in expenses) {
      final k = _ymd(DateTime.fromMillisecondsSinceEpoch(e.occurredAt));
      byDay[k] = (byDay[k] ?? 0) + e.amountBaseCents;
    }
    final hottest = byDay.entries.isEmpty
        ? null
        : (byDay.entries.toList()..sort((a, b) => b.value.compareTo(a.value)))
            .first;
    final food = expenses
        .where((e) => e.category == '餐饮')
        .fold(0, (s, e) => s + e.amountBaseCents);
    final engel = total > 0 ? (food / total * 100).round() : 0;
    final byCat = <String, int>{};
    for (final e in expenses) {
      byCat[e.category] = (byCat[e.category] ?? 0) + e.amountBaseCents;
    }
    final catRank = byCat.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    final transfers = state.settlement();
    final balances = state.balances();
    final netList = state.members
        .map((m) =>
            _Net(m.id, m.displayName, balances[m.id] ?? 0, m.settled))
        .toList()
      ..sort((a, b) => b.netCents.compareTo(a.netCents));
    String nameOf(String id) =>
        state.members.where((m) => m.id == id).firstOrNull?.displayName ??
        id;

    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 24,
        right: 24,
        top: 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('🎉 ${state.ledger.name} · 复盘报告',
                      style: TextStyle(
                          color: ink900,
                          fontSize: 18,
                          fontWeight: FontWeight.w600)),
                ),
                IconButton(
                  icon: const Text('✕', style: TextStyle(fontSize: 20)),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [
                  Color(0xFFFFD1DC),
                  Color(0xFFE9D5FF),
                  Color(0xFFFFF1C1),
                ]),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('这次旅行总花费',
                      style: TextStyle(color: ink500, fontSize: 12)),
                  const SizedBox(height: 4),
                  Money(cents: total,
                      style: TextStyle(
                          color: ink900,
                          fontSize: 32,
                          fontWeight: FontWeight.w800)),
                  Text(base, style: TextStyle(color: ink500, fontSize: 12)),
                  const SizedBox(height: 8),
                  Text('${expenses.length} 笔账目 · ${state.members.length} 位同伴',
                      style: TextStyle(color: ink500, fontSize: 12)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (bigSpender != null && bigSpender.netCents > 0)
              _ReportCard(
                emoji: '💸',
                title: '散财童子',
                child: RichText(
                  text: TextSpan(
                    style: TextStyle(color: ink500, fontSize: 13),
                    children: [
                      TextSpan(
                          text: bigSpender.name,
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                      const TextSpan(text: ' · 承担了 '),
                      TextSpan(
                          text:
                              '${money.Money.formatPlain(bigSpender.netCents)} $base',
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                      const TextSpan(text: ' ，占总花费的 '),
                      TextSpan(
                          text:
                              '${total > 0 ? ((bigSpender.netCents / total * 100).round()) : 0}%',
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
            if (cheapSkate != null &&
                cheapSkate.memberId != bigSpender?.memberId &&
                cheapSkate.netCents >= 0)
              _ReportCard(
                emoji: '🐔',
                title: '铁公鸡',
                child: RichText(
                  text: TextSpan(
                    style: TextStyle(color: ink500, fontSize: 13),
                    children: [
                      TextSpan(
                          text: cheapSkate.name,
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                      const TextSpan(text: ' · 只承担了 '),
                      TextSpan(
                          text:
                              '${money.Money.formatPlain(cheapSkate.netCents)} $base',
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                      const TextSpan(text: '，超会省'),
                    ],
                  ),
                ),
              ),
            if (priciest != null)
              _ReportCard(
                emoji: '👑',
                title: '最贵一笔',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    RichText(
                      text: TextSpan(
                        style: TextStyle(color: ink900, fontSize: 13),
                        children: [
                          TextSpan(
                              text: priciest.title,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w600)),
                          TextSpan(
                              text:
                                  ' · ${money.Money.formatPlain(priciest.amountBaseCents)} $base'),
                        ],
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                        '${nameOf(priciest.payerId)} 垫付 · ${priciest.category}',
                        style: TextStyle(color: ink500, fontSize: 11)),
                  ],
                ),
              ),
            if (hottest != null)
              _ReportCard(
                emoji: '🔥',
                title: '最烧钱的一天',
                child: RichText(
                  text: TextSpan(
                    style: TextStyle(color: ink500, fontSize: 13),
                    children: [
                      TextSpan(
                          text: hottest.key,
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                      const TextSpan(text: ' · 一天花掉 '),
                      TextSpan(
                          text:
                              '${money.Money.formatPlain(hottest.value)} $base',
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
            if (food > 0)
              _ReportCard(
                emoji: '🍜',
                title: '恩格尔系数',
                child: RichText(
                  text: TextSpan(
                    style: TextStyle(color: ink500, fontSize: 13),
                    children: [
                      const TextSpan(
                          text: '餐饮占比 ',
                          style: TextStyle(fontWeight: FontWeight.w600)),
                      TextSpan(
                          text: '$engel%',
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                      TextSpan(
                          text:
                              '（${money.Money.formatPlain(food)} $base）'),
                    ],
                  ),
                ),
              ),
            if (catRank.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: border, width: 1),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('💼 花在哪儿',
                        style: TextStyle(color: ink500, fontSize: 12)),
                    const SizedBox(height: 8),
                    for (final c in catRank)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(c.key,
                                style: TextStyle(
                                    color: ink900, fontSize: 13)),
                            Text(
                                '${money.Money.formatPlain(c.value)} · ${total > 0 ? ((c.value / total * 100).round()) : 0}%',
                                style: TextStyle(
                                    color: ink500, fontSize: 13)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            if (transfers.isNotEmpty) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isDark
                      ? const Color(0x33EC4899)
                      : const Color(0xFFECFDF5),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                      color: isDark
                          ? const Color(0x66EC4899)
                          : const Color(0xFFA7F3D0),
                      width: 1),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('🧾 结算清单',
                        style: TextStyle(
                            color: green,
                            fontSize: 13,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    for (final t in transfers)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('${nameOf(t.fromId)} → ${nameOf(t.toId)}',
                                style: TextStyle(
                                    color: ink900, fontSize: 14)),
                            Money(cents: t.amountCents,
                                style: TextStyle(
                                    color: green,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),
            if (netList.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: border, width: 1),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('明细净额',
                        style: TextStyle(color: ink500, fontSize: 12)),
                    const SizedBox(height: 8),
                    for (final b in netList)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(b.name,
                                style: TextStyle(
                                    color: ink900, fontSize: 14)),
                            Money(
                              cents: b.netCents,
                              sign: true,
                              style: TextStyle(
                                color: b.netCents > 0
                                    ? green
                                    : (b.netCents < 0
                                        ? AppColors.lightSemanticRed
                                        : ink500),
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: ink900,
                  foregroundColor:
                      isDark ? AppColors.darkInk100 : Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16)),
                ),
                child: const Text('完成'),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard(
      {required this.emoji, required this.title, required this.child});
  final String emoji;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border, width: 1),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 24)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(color: ink500, fontSize: 11)),
                const SizedBox(height: 2),
                child,
              ],
            ),
          ),
        ],
      ),
    );
  }
}
