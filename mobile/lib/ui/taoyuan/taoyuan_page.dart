import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';

import '../../core/money.dart' as money;
import '../../core/reward_method.dart';
import '../../data/local/event_dao.dart';
import '../../data/models/ledger.dart';
import '../../data/models/taoyuan_event.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/money.dart';
import '../widgets/page_header.dart';

// ───────────────────────── 常量（对齐网页端 types.ts / RewardMethod） ─────────────────────────

/// 四阶段顺序：发布 → 预测 → 公示 → 发钱。
const List<String> _kStatusOrder = [
  'published',
  'predicted',
  'announced',
  'paid',
];

/// 分区大标题（网页端 STATUS_LABEL）。
const Map<String, String> _kStatusSectionLabel = {
  'published': '活动火热进行中',
  'predicted': '待公示',
  'announced': '待发钱',
  'paid': '已到账',
};

/// 阶段卡小标题（网页端 STAGE_LABEL）。
const Map<String, String> _kStageLabel = {
  'predicted': '预测收入',
  'announced': '公示奖金',
  'paid': '到账金额',
};

/// 状态 pill 短标签。
const Map<String, String> _kStatusPill = {
  'published': '已发布',
  'predicted': '预测',
  'announced': '公示',
  'paid': '到账',
};

/// 金额发放方式候选（网页端 REWARD_METHODS）。
const List<String> _kRewardMethods = [
  'cash',
  'jdcard',
  'qcoin',
  'carrotcoin',
  'merch',
];

/// 状态推进到下一阶段；paid 之后返回 null。
String? _nextStatus(String status) {
  final i = _kStatusOrder.indexOf(status);
  if (i < 0 || i >= _kStatusOrder.length - 1) return null;
  return _kStatusOrder[i + 1];
}

/// 状态 pill 配色（品牌色，跨主题固定）。
({Color bg, Color fg, String label}) _statusPill(String status, bool isDark) {
  final label = _kStatusPill[status] ?? status;
  switch (status) {
    case 'published':
      return (
        bg: isDark ? AppColors.darkInk100 : AppColors.lightInk900,
        fg: isDark ? AppColors.darkPageBg : AppColors.lightSurface,
        label: label,
      );
    case 'predicted':
      return (
        bg: isDark ? AppColors.darkSurface : AppColors.lightInk100,
        fg: isDark ? AppColors.darkInk400 : AppColors.lightInk500,
        label: label,
      );
    case 'announced':
      return (
        bg: const Color(0xFFFEF3C7),
        fg: const Color(0xFF92400E),
        label: label,
      );
    case 'paid':
      return (
        bg: const Color(0xFFDCFCE7),
        fg: const Color(0xFF166534),
        label: label,
      );
    default:
      return (
        bg: isDark ? AppColors.darkSurface : AppColors.lightInk100,
        fg: isDark ? AppColors.darkInk400 : AppColors.lightInk500,
        label: label,
      );
  }
}

/// content_images 原始字符串（JSON 数组或换行/逗号分隔）→ URL 列表。
List<String> _parseImages(String? raw) {
  if (raw == null || raw.isEmpty) return const <String>[];
  try {
    final d = jsonDecode(raw);
    if (d is List) return d.whereType<String>().toList();
  } catch (_) {
    // 退回纯文本解析
  }
  return raw
      .split(RegExp(r'[\n,]'))
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toList();
}

/// 多行文本 → content_images JSON 字符串（空则 null）。
String? _imagesToJson(String text) {
  final list = text
      .split('\n')
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toList();
  return list.isEmpty ? null : jsonEncode(list);
}

String? _fmt(int? millis) {
  if (millis == null) return null;
  return DateFormat('M/d HH:mm')
      .format(DateTime.fromMillisecondsSinceEpoch(millis));
}

// ───────────────────────── 金额聚合 / 劳务报酬个税（对齐网页端 amounts.ts / tax.ts） ─────────────────────────

/// 某阶段金额类合计（仅 money 种；Q币/周边不是钱，不计入）。
int _moneySum(List<EventAmount> amounts, String stage) => amounts
    .where((a) => a.stage == stage && rewardValueKind(a.rewardMethod) == 'money')
    .fold(0, (int s, EventAmount a) => s + a.cents);

/// 某阶段应税（现金等）与免税（京东卡）拆分；京东卡不并入税基。
({int taxable, int nonTaxable}) _taxSplit(
  List<EventAmount> amounts,
  String stage,
) {
  int taxable = 0;
  int nonTaxable = 0;
  for (final a in amounts) {
    if (a.stage != stage) continue;
    if (rewardValueKind(a.rewardMethod) != 'money') continue;
    if (a.rewardMethod == 'jdcard') {
      nonTaxable += a.cents;
    } else {
      taxable += a.cents;
    }
  }
  return (taxable: taxable, nonTaxable: nonTaxable);
}

/// 劳务报酬个税预扣（默认档位，单位：分），对齐 src/lib/tax.ts DEFAULT_TAX_BRACKETS。
int _calcTaxCents(int income) {
  if (income <= 0) return 0;
  const brackets = <({int? upTo, double rate, int deduct, int quick})>[
    (upTo: 80000, rate: 0.0, deduct: 0, quick: 0),
    (upTo: 400000, rate: 0.2, deduct: 80000, quick: 0),
    (upTo: 2500000, rate: 0.16, deduct: 0, quick: 0),
    (upTo: 6250000, rate: 0.24, deduct: 0, quick: 200000),
    (upTo: null, rate: 0.32, deduct: 0, quick: 700000),
  ];
  final b = brackets.firstWhere(
    (x) {
      final upTo = x.upTo;
      return upTo == null || income <= upTo;
    },
    orElse: () => brackets.last,
  );
  final taxable = (income - b.deduct).clamp(0, income);
  final tax = (taxable * b.rate - b.quick).round();
  return tax.clamp(0, income);
}

/// 税后收入 = 收入 - 税额。
int _afterTaxCents(int income) => income - _calcTaxCents(income);

// ───────────────────────── 数据层（Provider / ChangeNotifier） ─────────────────────────

/// 桃源账本本地存储 + 状态。事件/金额全量加载（本地优先，数据量小）。
class _TaoyuanStore extends ChangeNotifier {
  final Ledger ledger;
  final EventDao _dao = EventDao();
  _TaoyuanStore(this.ledger);

  List<TaoyuanEvent> events = const [];
  Map<String, List<EventAmount>> amountsByEvent = const {};
  TaoyuanRewardTotals totals = const TaoyuanRewardTotals();
  int pending = 0;
  bool loading = true;

  Future<void> load() async {
    loading = true;
    notifyListeners();
    final evs = await _dao.listByLedger(ledger.id);
    final map = <String, List<EventAmount>>{};
    for (final e in evs) {
      map[e.id] = await _dao.listAmounts(e.id);
    }
    events = evs;
    amountsByEvent = map;
    totals = await _dao.rewardTotals(ledger.id);
    pending = await _dao.pendingCount(ledger.id);
    loading = false;
    notifyListeners();
  }

  List<EventAmount> amountsOf(String eventId) => amountsByEvent[eventId] ?? const [];

  TaoyuanEvent? _find(String id) {
    for (final e in events) {
      if (e.id == id) return e;
    }
    return null;
  }

  Future<void> _reloadAmounts(String eventId) async {
    amountsByEvent = {
      ...amountsByEvent,
      eventId: await _dao.listAmounts(eventId),
    };
    await _refreshMeta();
  }

  Future<void> _refreshMeta() async {
    totals = await _dao.rewardTotals(ledger.id);
    pending = await _dao.pendingCount(ledger.id);
    notifyListeners();
  }

  /// 新建活动（发布态）。可选写入一条初始金额。
  Future<void> addEvent(TaoyuanEvent e, {EventAmount? initialAmount}) async {
    await _dao.insertEvent(e);
    if (initialAmount != null) await _dao.insertAmount(initialAmount);
    await load();
  }

  /// 更新活动元信息（含 status 推进）。
  Future<void> updateEvent(TaoyuanEvent e) async {
    await _dao.update(e);
    await load();
  }

  /// 删除活动：先清其金额，再软删活动本身。
  Future<void> deleteEvent(String id) async {
    await _dao.deleteAmountsByEvent(id);
    await _dao.softDeleteEvent(id);
    await load();
  }

  /// 单条推进到下一阶段。
  Future<void> advanceStage(TaoyuanEvent e) async {
    final next = _nextStatus(e.status);
    if (next == null) return;
    await _dao.update(e.copyWith(status: next, synced: 0));
    await load();
  }

  /// 批量推进（MergeBar 简化版）：把若干活动一起推到下一阶段。
  Future<void> advanceMany(List<String> ids) async {
    for (final id in ids) {
      final e = _find(id);
      if (e == null) continue;
      final next = _nextStatus(e.status);
      if (next == null) continue;
      await _dao.update(e.copyWith(status: next, synced: 0));
    }
    await load();
  }

  /// 顶层活动（parentId 为空）；合并后的子活动不单独出现在分区里。
  List<TaoyuanEvent> get topLevelEvents =>
      events.where((e) => e.parentId == null).toList();

  /// 某父活动下的子活动列表（合并后挂在下面）。
  List<TaoyuanEvent> childrenOf(String parentId) =>
      events.where((e) => e.parentId == parentId).toList();

  /// 合并：把若干活动挂到 [parentId] 下，可选更新父活动名。
  /// 金额不物理搬运，展示时按父+子聚合（对齐网页端 /api/events/merge）。
  Future<void> mergeEvents({
    required String parentId,
    required List<String> childIds,
    String? title,
  }) async {
    for (final cid in childIds) {
      final c = _find(cid);
      if (c == null) continue;
      await _dao.update(c.copyWith(parentId: parentId, synced: 0));
    }
    if (title != null && title.trim().isNotEmpty) {
      final p = _find(parentId);
      if (p != null) {
        await _dao.update(p.copyWith(title: title.trim(), synced: 0));
      }
    }
    await load();
  }

  /// 摘出：把子活动恢复为独立顶层活动（对齐网页端 /api/events/{id}/unmerge）。
  Future<void> extractEvent(String childId) async {
    final c = _find(childId);
    if (c == null) return;
    await _dao.update(c.copyWith(parentId: null, synced: 0));
    await load();
  }

  Future<void> addAmount({
    required String eventId,
    required String stage,
    int cents = 0,
    int? quantity,
    String? itemDesc,
    String? note,
    String? rewardMethod,
  }) async {
    final a = EventAmount(
      id: const Uuid().v4(),
      eventId: eventId,
      stage: stage,
      cents: cents,
      quantity: quantity,
      itemDesc: itemDesc,
      note: note,
      rewardMethod: rewardMethod,
      occurredAt: DateTime.now().millisecondsSinceEpoch,
      synced: 0,
    );
    await _dao.insertAmount(a);
    await _reloadAmounts(eventId);
  }

  Future<void> updateAmount(EventAmount a) async {
    // insertAmount 用 ConflictAlgorithm.replace 按 id 覆盖，等价 update。
    await _dao.insertAmount(a.copyWith(synced: 0));
    await _reloadAmounts(a.eventId);
  }

  Future<void> deleteAmount(EventAmount a) async {
    await _dao.softDeleteAmount(a.id);
    await _reloadAmounts(a.eventId);
  }
}

// ───────────────────────── 页面入口 ─────────────────────────

/// 桃源账本页（rebuild：1:1 对齐网页端 src/app/taoyuan/* 的四阶段工作流）。
class TaoyuanPage extends StatelessWidget {
  final Ledger ledger;

  const TaoyuanPage({super.key, required this.ledger});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    return ChangeNotifierProvider(
      create: (_) => _TaoyuanStore(ledger)..load(),
      child: Scaffold(
        backgroundColor: pageBg,
        body: SafeArea(
          child: const _Body(),
        ),
      ),
    );
  }
}

// ───────────────────────── 主体（分组 / 选择 / 批量推进） ─────────────────────────

class _Body extends StatefulWidget {
  const _Body();

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  bool _selecting = false;
  final Set<String> _selected = {};

  void _toggle(String id) {
    setState(() {
      if (_selected.contains(id)) {
        _selected.remove(id);
      } else {
        _selected.add(id);
      }
    });
  }

  void _exitSelecting() {
    setState(() {
      _selecting = false;
      _selected.clear();
    });
  }

  void _openEdit(BuildContext context, _TaoyuanStore store, TaoyuanEvent? event) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChangeNotifierProvider.value(
        value: store,
        child: EditEventSheet(store: store, event: event),
      ),
    );
  }

  Future<void> _confirmDelete(
    BuildContext context,
    _TaoyuanStore store,
    TaoyuanEvent e,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('删除活动 "${e.title}"？'),
        content: const Text('此活动的所有金额记录会一并删除。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (ok == true && mounted) await store.deleteEvent(e.id);
  }

  /// 打开合并确认弹层（对齐网页端 MergeBar 的 confirm 弹窗）。
  void _openMergeConfirm(BuildContext context, _TaoyuanStore store) {
    final selectedEvents = _selected
        .map((id) => store._find(id))
        .whereType<TaoyuanEvent>()
        .toList();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChangeNotifierProvider.value(
        value: store,
        child: _MergeConfirmSheet(
          events: selectedEvents,
          onCancel: () => Navigator.pop(context),
          onConfirm: (parentId, title) async {
            Navigator.pop(context);
            await store.mergeEvents(
              parentId: parentId,
              childIds: _selected.where((id) => id != parentId).toList(),
              title: title,
            );
            _exitSelecting();
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final store = context.watch<_TaoyuanStore>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;

    final groups = <String, List<TaoyuanEvent>>{};
    for (final s in _kStatusOrder) groups[s] = [];
    for (final e in store.topLevelEvents) {
      (groups[e.status] ??= []).add(e);
    }

    return Stack(
      children: [
        SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(24, 56, 24, _selecting ? 104 : 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PageHeader(
                icon: '🌸',
                title: '桃源账本',
                subtitle: '${store.ledger.name} · 发布 → 预测 → 公示 → 发钱',
                actions: store.pending > 0
                    ? [_PendingBadge(count: store.pending)]
                    : null,
              ),
              const SizedBox(height: 8),
              // 选择 / 计数
              Row(
                children: [
                  Text(
                    store.topLevelEvents.isEmpty
                        ? ''
                        : '共 ${store.topLevelEvents.length} 个活动',
                    style: TextStyle(color: ink500, fontSize: 12),
                  ),
                  const Spacer(),
                  if (store.events.isNotEmpty)
                    TextButton(
                      onPressed: () => setState(() => _selecting = !_selecting),
                      child: Text(_selecting ? '完成' : '选择'),
                    ),
                ],
              ),
              if (!_selecting)
                Padding(
                  padding: const EdgeInsets.only(top: 4, bottom: 4),
                  child: AppPrimaryButton(
                    label: '+ 新活动',
                    onPressed: () => _openEdit(context, store, null),
                  ),
                ),
              const SizedBox(height: 4),
              // 四阶段分区（paid 为空则隐藏，对齐网页端）
              for (final s in _kStatusOrder)
                if (!(s == 'paid' && (groups[s]?.isEmpty ?? true)))
                  _StageSection(
                    label: _kStatusSectionLabel[s]!,
                    count: groups[s]?.length ?? 0,
                    children: (groups[s] ?? [])
                        .map(
                          (e) => _EventCard(
                            store: store,
                            event: e,
                            children: store.childrenOf(e.id),
                            selecting: _selecting,
                            selected: _selected.contains(e.id),
                            onToggle: () => _toggle(e.id),
                            onEdit: () => _openEdit(context, store, e),
                            onDelete: () => _confirmDelete(context, store, e),
                            onExtract: (c) => store.extractEvent(c.id),
                          ),
                        )
                        .toList(),
                  ),
              if (store.loading && store.events.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: Text('加载中…', style: TextStyle(color: ink400)),
                ),
            ],
          ),
        ),
        if (_selecting)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _MergeBar(
              count: _selected.length,
              canMerge: _selected.length >= 2,
              onMerge: () => _openMergeConfirm(context, store),
              onDone: _exitSelecting,
            ),
          ),
      ],
    );
  }
}

/// 待处理角标（标题右侧）。
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

/// 阶段分区标题 + 卡片列表 / 空态。
class _StageSection extends StatelessWidget {
  final String label;
  final int count;
  final List<Widget> children;
  const _StageSection({
    required this.label,
    required this.count,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 20, bottom: 8),
          child: Row(
            children: [
              Text(
                label,
                style: TextStyle(
                  color: ink500,
                  fontSize: 12,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(width: 6),
              Text('· $count', style: TextStyle(color: ink400, fontSize: 12)),
            ],
          ),
        ),
        if (children.isEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text('暂无', style: TextStyle(color: ink400, fontSize: 12)),
          )
        else
          ...children,
      ],
    );
  }
}

// ───────────────────────── 活动卡 ─────────────────────────

class _EventCard extends StatefulWidget {
  final _TaoyuanStore store;
  final TaoyuanEvent event;
  final List<TaoyuanEvent> children;
  final bool selecting;
  final bool selected;
  final VoidCallback onToggle;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final void Function(TaoyuanEvent) onExtract;

  const _EventCard({
    required this.store,
    required this.event,
    this.children = const [],
    this.selecting = false,
    this.selected = false,
    required this.onToggle,
    required this.onEdit,
    required this.onDelete,
    required this.onExtract,
  });

  @override
  State<_EventCard> createState() => _EventCardState();
}

class _EventCardState extends State<_EventCard> {
  bool _expanded = false;
  bool _copied = false;

  /// 父 + 所有子在该阶段的金额条目（合并后金额聚合，对齐网页端 allEntries）。
  List<EventAmount> _stageAmounts(String stage) {
    final own = widget.store.amountsByEvent[widget.event.id] ??
        const <EventAmount>[];
    final childAmts = widget.children.expand(
      (c) => widget.store.amountsByEvent[c.id] ?? const <EventAmount>[],
    );
    return [...own, ...childAmts].where((a) => a.stage == stage).toList();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final blue = isDark ? AppColors.darkSemanticBlue : AppColors.lightSemanticBlue;

    final event = widget.event;
    final methods = parseRewardMethods(event.rewardMethods, event.rewardMethod);
    final images = _parseImages(event.contentImages);
    final pill = _statusPill(event.status, isDark);
    final next = _nextStatus(event.status);
    final merged = widget.children.isNotEmpty;

    final stages = ['predicted', 'announced', 'paid'];
    final sums = <String, int>{
      for (final s in stages) s: _moneySum(_stageAmounts(s), s),
    };

    // 税后金额卡（劳务报酬）：公示金额 > 0 时展示，对齐网页端 EventCard.tsx。
    Widget? afterTaxCard;
    final announced = sums['announced']!;
    if (announced > 0) {
      final split = _taxSplit(_stageAmounts('announced'), 'announced');
      final tax = _calcTaxCents(split.taxable);
      final afterTax = _afterTaxCents(split.taxable) + split.nonTaxable;
      afterTaxCard = _AfterTaxCard(
        announced: announced,
        tax: tax,
        nonTaxable: split.nonTaxable,
        afterTax: afterTax,
        isDark: isDark,
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        radius: 24,
        onTap: widget.selecting ? widget.onToggle : null,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: surface,
            borderRadius: BorderRadius.circular(24),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (widget.selecting)
                    Padding(
                      padding: const EdgeInsets.only(top: 2, right: 8),
                      child: _Checkbox(
                        selected: widget.selected,
                        onTap: widget.onToggle,
                        isDark: isDark,
                      ),
                    ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Text(
                                event.title,
                                style: TextStyle(
                                  color: ink900,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            if (merged)
                              Padding(
                                padding: const EdgeInsets.only(left: 8),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: blue.withOpacity(0.12),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    '已合并 ${widget.children.length}',
                                    style: TextStyle(color: blue, fontSize: 10),
                                  ),
                                ),
                              ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: pill.bg,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                pill.label,
                                style: TextStyle(color: pill.fg, fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                        if (methods.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: methods
                                  .map((m) => _MethodChip(m, isDark))
                                  .toList(),
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (!widget.selecting)
                    Row(
                      children: [
                        _IconBtn(icon: Icons.edit, color: ink400, onTap: widget.onEdit),
                        _IconBtn(icon: Icons.close, color: red, onTap: widget.onDelete),
                      ],
                    ),
                ],
              ),
              // 元信息
              ..._metaLines(event, ink500),
              // 图片
              if (images.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: images
                        .map((u) => _Thumb(url: u, isDark: isDark))
                        .toList(),
                  ),
                ),
              // 话题 tag（对齐网页 EventCard 的复制按钮）
              if (event.topicTag != null && event.topicTag!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: InkWell(
                    onTap: _copyTag,
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: surface,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              event.topicTag!,
                              style: TextStyle(color: ink500, fontSize: 12),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _copied ? '已复制' : '复制',
                            style: TextStyle(color: ink400, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              // 三阶段金额卡（含子活动金额）
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Row(
                  children: stages
                      .map(
                        (s) => Expanded(
                          child: _StageMiniCard(
                            stage: s,
                            amounts: _stageAmounts(s),
                            highlight: s == 'paid' && sums['paid']! > 0,
                            count: _stageAmounts(s).length,
                            isDark: isDark,
                            onTap: widget.selecting
                                ? null
                                : () => _openStage(context, widget.store, event, s),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
              if (afterTaxCard != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: afterTaxCard,
                ),
              // 推进下一阶段
              if (!widget.selecting && next != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: _AdvanceButton(
                    label: '推进到${_kStatusPill[next]}',
                    isDark: isDark,
                    onTap: () => widget.store.advanceStage(event),
                  ),
                ),
              // 合并后的子活动（可展开 / 摘出）
              if (merged)
                _MergeChildren(
                  children: widget.children,
                  expanded: _expanded,
                  onToggle: () => setState(() => _expanded = !_expanded),
                  onExtract: widget.onExtract,
                  store: widget.store,
                ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _metaLines(TaoyuanEvent e, Color ink500) {
    final lines = <Widget>[];
    void add(String text) => lines.add(
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              text,
              style: TextStyle(color: ink500, fontSize: 12),
            ),
          ),
        );
    final start = _fmt(e.startAt);
    final deadline = _fmt(e.deadline);
    if (start != null) add('开始 $start');
    if (deadline != null) add('截止 $deadline');
    if (e.reward != null && e.reward!.isNotEmpty) add('奖励：${e.reward}');
    if (e.content != null && e.content!.isNotEmpty) add('内容：${e.content}');
    if (e.note != null && e.note!.isNotEmpty) add('备注：${e.note}');
    if (lines.isEmpty) return const <Widget>[];
    return [
      Padding(padding: const EdgeInsets.only(top: 8), child: Column(children: lines)),
    ];
  }

  Future<void> _copyTag() async {
    final tag = widget.event.topicTag;
    if (tag == null || tag.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: tag));
    if (mounted) setState(() => _copied = true);
    Future.delayed(const Duration(milliseconds: 1500), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  void _openStage(
    BuildContext context,
    _TaoyuanStore store,
    TaoyuanEvent event,
    String stage,
  ) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChangeNotifierProvider.value(
        value: store,
        child: StageDetailSheet(store: store, event: event, stage: stage),
      ),
    );
  }
}

class _MethodChip extends StatelessWidget {
  final String method;
  final bool isDark;
  const _MethodChip(this.method, this.isDark);

  @override
  Widget build(BuildContext context) {
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightInk100;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        rewardMethodLabel(method),
        style: TextStyle(color: ink500, fontSize: 10),
      ),
    );
  }
}

class _IconBtn extends StatelessWidget {
  final IconData icon;
  final Color? color;
  final VoidCallback onTap;
  const _IconBtn({required this.icon, this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Icon(icon, size: 18, color: color ?? ink400),
      ),
    );
  }
}

class _Checkbox extends StatelessWidget {
  final bool selected;
  final VoidCallback onTap;
  final bool isDark;
  const _Checkbox({
    required this.selected,
    required this.onTap,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    final fill = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final fg = isDark ? AppColors.darkPageBg : AppColors.lightSurface;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        width: 22,
        height: 22,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: selected ? fill : pageBg,
          border: Border.all(
            width: 2,
            color: selected ? fill : border,
          ),
        ),
        child: selected
            ? Center(child: Icon(Icons.check, size: 12, color: fg))
            : null,
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  final String url;
  final bool isDark;
  const _Thumb({required this.url, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final surface = isDark ? AppColors.darkSurface : AppColors.lightInk100;
    return InkWell(
      onTap: () => showDialog(
        context: context,
        builder: (_) => Dialog(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.network(url, fit: BoxFit.contain, errorBuilder: (
              _,
              __,
              ___,
            ) =>
                Container(color: surface, child: const Icon(Icons.broken_image))),
          ),
        ),
      ),
      child: SizedBox(
        width: 96,
        height: 96,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.network(
            url,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) =>
                Container(color: surface, child: const Icon(Icons.broken_image)),
          ),
        ),
      ),
    );
  }
}

/// 单阶段金额卡：展示该阶段合计（金额走 Money，个数/文字走文本）。
class _StageMiniCard extends StatelessWidget {
  final String stage;
  final List<EventAmount> amounts;
  final bool highlight;
  final int count;
  final bool isDark;
  final VoidCallback? onTap;
  const _StageMiniCard({
    required this.stage,
    required this.amounts,
    this.highlight = false,
    this.count = 0,
    required this.isDark,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final greenBg = isDark
        ? const Color(0x33DCFCE7)
        : const Color(0xFFDCFCE7);
    final greenBorder = isDark
        ? const Color(0x66346630)
        : const Color(0xFFBBF7D0);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: highlight ? greenBg : surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: highlight ? greenBorder : border),
        ),
        child: Column(
          children: [
            Text(
              count > 1 ? '${_kStageLabel[stage]} · $count' : _kStageLabel[stage]!,
              style: TextStyle(color: ink500, fontSize: 10),
            ),
            const SizedBox(height: 4),
            _stageSumWidget(amounts, ink900, ink400),
          ],
        ),
      ),
    );
  }
}

Widget _stageSumWidget(List<EventAmount> amounts, Color ink900, Color ink400) {
  if (amounts.isEmpty) {
    return Text(
      '+填写',
      style: TextStyle(color: ink400, fontSize: 13, fontWeight: FontWeight.bold),
    );
  }
  final moneySum = amounts
      .where((a) => rewardValueKind(a.rewardMethod) == 'money')
      .fold(0, (int s, EventAmount a) => s + a.cents);
  if (moneySum > 0) {
    return Money(
      cents: moneySum,
      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
    );
  }
  final a = amounts.first;
  final k = rewardValueKind(a.rewardMethod);
  final text = k == 'count'
      ? '${a.quantity ?? 0} ${rewardMethodLabel(a.rewardMethod)}'
      : (a.itemDesc ?? rewardMethodLabel(a.rewardMethod));
  return Text(
    text,
    style: TextStyle(color: ink900, fontSize: 13, fontWeight: FontWeight.bold),
  );
}

class _AdvanceButton extends StatelessWidget {
  final String label;
  final bool isDark;
  final VoidCallback onTap;
  const _AdvanceButton({
    required this.label,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(color: ink500, fontSize: 13, fontWeight: FontWeight.w600),
          ),
        ),
      ),
    );
  }
}

// ───────────────────────── MergeBar（合并子活动） ─────────────────────────

class _MergeBar extends StatelessWidget {
  final int count;
  final bool canMerge;
  final VoidCallback onMerge;
  final VoidCallback onDone;
  const _MergeBar({
    required this.count,
    required this.canMerge,
    required this.onMerge,
    required this.onDone,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fill = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final text = isDark ? AppColors.darkPageBg : AppColors.lightSurface;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    return Container(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
      color: surface,
      child: Row(
        children: [
          Expanded(
            child: Text(
              '已选 $count 项${canMerge ? '' : ' · 至少 2 项'}',
              style: TextStyle(color: ink500, fontSize: 13),
            ),
          ),
          TextButton(
            onPressed: onDone,
            child: const Text('完成'),
          ),
          const SizedBox(width: 8),
          ElevatedButton(
            onPressed: canMerge ? onMerge : null,
            style: ElevatedButton.styleFrom(
              backgroundColor: fill,
              foregroundColor: text,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text('合并'),
          ),
        ],
      ),
    );
  }
}

// ───────────────────────── 税后金额卡（劳务报酬） ─────────────────────────

class _AfterTaxCard extends StatelessWidget {
  final int announced;
  final int tax;
  final int nonTaxable;
  final int afterTax;
  final bool isDark;
  const _AfterTaxCard({
    required this.announced,
    required this.tax,
    required this.nonTaxable,
    required this.afterTax,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    final bg = isDark ? AppColors.darkAfterTaxBg : AppColors.lightAfterTaxBg;
    final border =
        isDark ? AppColors.darkAfterTaxBorder : AppColors.lightAfterTaxBorder;
    final fg = isDark ? AppColors.darkAfterTaxFg : AppColors.lightAfterTaxFg;
    final sub = isDark ? AppColors.darkAfterTaxSub : AppColors.lightAfterTaxSub;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('税后金额（劳务报酬）',
                  style: TextStyle(color: fg, fontSize: 12)),
              Money(
                cents: afterTax,
                style: TextStyle(
                  color: fg,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 4,
              children: [
                Text('公示 ', style: TextStyle(color: sub, fontSize: 10)),
                Money(cents: announced, style: TextStyle(color: sub, fontSize: 10)),
                Text(' · 应纳税 ', style: TextStyle(color: sub, fontSize: 10)),
                Money(cents: tax, style: TextStyle(color: sub, fontSize: 10)),
                if (nonTaxable > 0) ...[
                  Text(' · 京东卡 ',
                      style: TextStyle(color: sub, fontSize: 10)),
                  Money(cents: nonTaxable, style: TextStyle(color: sub, fontSize: 10)),
                  Text(' 不计税', style: TextStyle(color: sub, fontSize: 10)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ───────────────────────── 合并后的子活动列表（展开 / 摘出） ─────────────────────────

class _MergeChildren extends StatelessWidget {
  final List<TaoyuanEvent> children;
  final bool expanded;
  final VoidCallback onToggle;
  final void Function(TaoyuanEvent) onExtract;
  final _TaoyuanStore store;
  const _MergeChildren({
    required this.children,
    required this.expanded,
    required this.onToggle,
    required this.onExtract,
    required this.store,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final childBg = isDark ? AppColors.darkSurface : AppColors.lightInk100;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        InkWell(
          onTap: onToggle,
          child: Text(
            expanded ? '收起子活动' : '展开 ${children.length} 个子活动',
            style: TextStyle(
              color: ink500,
              fontSize: 12,
              decoration: TextDecoration.underline,
            ),
          ),
        ),
        if (expanded)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: children
                  .map(
                    (c) => _ChildRow(
                      child: c,
                      store: store,
                      ink400: ink400,
                      ink500: ink500,
                      childBg: childBg,
                      border: border,
                      onExtract: () => onExtract(c),
                    ),
                  )
                  .toList(),
            ),
          ),
      ],
    );
  }
}

class _ChildRow extends StatelessWidget {
  final TaoyuanEvent child;
  final _TaoyuanStore store;
  final Color ink400;
  final Color ink500;
  final Color childBg;
  final Color border;
  final VoidCallback onExtract;
  const _ChildRow({
    required this.child,
    required this.store,
    required this.ink400,
    required this.ink500,
    required this.childBg,
    required this.border,
    required this.onExtract,
  });

  @override
  Widget build(BuildContext context) {
    final amounts = store.amountsByEvent[child.id] ?? const <EventAmount>[];
    final pSum = _moneySum(amounts, 'predicted');
    final aSum = _moneySum(amounts, 'announced');
    final paidSum = _moneySum(amounts, 'paid');

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: childBg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  child.title,
                  style: TextStyle(
                    color: ink500,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    if (pSum > 0) ...[
                      Text('预 ', style: TextStyle(color: ink400, fontSize: 10)),
                      Money(
                        cents: pSum,
                        style: TextStyle(color: ink400, fontSize: 10),
                      ),
                      const SizedBox(width: 6),
                    ],
                    if (aSum > 0) ...[
                      Text('公 ', style: TextStyle(color: ink400, fontSize: 10)),
                      Money(
                        cents: aSum,
                        style: TextStyle(color: ink400, fontSize: 10),
                      ),
                      const SizedBox(width: 6),
                    ],
                    if (paidSum > 0) ...[
                      Text('到 ', style: TextStyle(color: ink400, fontSize: 10)),
                      Money(
                        cents: paidSum,
                        style: TextStyle(color: ink400, fontSize: 10),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: onExtract,
            child: Text('摘出',
                style: TextStyle(
                  color: ink500,
                  fontSize: 10,
                  decoration: TextDecoration.underline,
                )),
          ),
        ],
      ),
    );
  }
}

// ───────────────────────── 合并确认弹层 ─────────────────────────

class _MergeConfirmSheet extends StatefulWidget {
  final List<TaoyuanEvent> events;
  final VoidCallback onCancel;
  final void Function(String parentId, String title) onConfirm;
  const _MergeConfirmSheet({
    super.key,
    required this.events,
    required this.onCancel,
    required this.onConfirm,
  });

  @override
  State<_MergeConfirmSheet> createState() => _MergeConfirmSheetState();
}

class _MergeConfirmSheetState extends State<_MergeConfirmSheet> {
  late String _parentId;
  late final TextEditingController _title;

  @override
  void initState() {
    super.initState();
    _parentId = widget.events.first.id;
    _title = TextEditingController(
      text: widget.events.map((e) => e.title).join(' + '),
    );
  }

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final fill = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final text = isDark ? AppColors.darkPageBg : AppColors.lightSurface;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final unselBg = isDark ? AppColors.darkSurface : AppColors.lightInk100;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;

    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('合并 ${widget.events.length} 个活动',
                style: TextStyle(
                  color: ink900,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                )),
            const SizedBox(height: 4),
            Text('选一个作为主活动，其余的会挂在主活动下面。合并后金额直接相加。',
                style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 12),
            Text('主活动', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 6),
            ...widget.events.map(
              (ev) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: InkWell(
                  onTap: () => setState(() => _parentId = ev.id),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _parentId == ev.id ? fill : unselBg,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: _parentId == ev.id ? fill : border,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(ev.title,
                            style: TextStyle(
                              color: _parentId == ev.id ? text : ink900,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            )),
                        const SizedBox(height: 2),
                        Text(ev.status,
                            style: TextStyle(
                              color: _parentId == ev.id ? text : ink500,
                              fontSize: 11,
                            )),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text('合并后的名字', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 6),
            AppTextField(hint: '合并后的名字', controller: _title),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextButton(
                    onPressed: widget.onCancel,
                    child: const Text('取消'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: AppPrimaryButton(
                    label: '确认合并',
                    onPressed: () => widget.onConfirm(_parentId, _title.text),
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

// ───────────────────────── 编辑/新建活动弹层 ─────────────────────────

class EditEventSheet extends StatefulWidget {
  final _TaoyuanStore store;
  final TaoyuanEvent? event;
  const EditEventSheet({super.key, required this.store, this.event});

  @override
  State<EditEventSheet> createState() => _EditEventSheetState();
}

class _EditEventSheetState extends State<EditEventSheet> {
  late final TextEditingController _title;
  late final TextEditingController _content;
  late final TextEditingController _reward;
  late final TextEditingController _topicTag;
  late final TextEditingController _note;
  late final TextEditingController _imageText;
  late final TextEditingController _amount;
  late final TextEditingController _custom;

  DateTime? _startAt;
  DateTime? _deadline;

  late List<String> _methods;
  late bool _participate;
  late String _amountMethod;
  late String _stage;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.event;
    _title = TextEditingController(text: e?.title ?? '');
    _content = TextEditingController(text: e?.content ?? '');
    _reward = TextEditingController(text: e?.reward ?? '');
    _topicTag = TextEditingController(text: e?.topicTag ?? '');
    _note = TextEditingController(text: e?.note ?? '');
    _imageText = TextEditingController(
      text: _parseImages(e?.contentImages).join('\n'),
    );
    _amount = TextEditingController();
    _custom = TextEditingController();
    _methods = parseRewardMethods(e?.rewardMethods, e?.rewardMethod);
    _participate = e?.participate ?? true;
    _amountMethod = 'cash';
    _stage = 'predicted';
    _startAt =
        e?.startAt != null ? DateTime.fromMillisecondsSinceEpoch(e!.startAt!) : null;
    _deadline = e?.deadline != null
        ? DateTime.fromMillisecondsSinceEpoch(e!.deadline!)
        : null;
  }

  @override
  void dispose() {
    _title.dispose();
    _content.dispose();
    _reward.dispose();
    _topicTag.dispose();
    _note.dispose();
    _imageText.dispose();
    _amount.dispose();
    _custom.dispose();
    super.dispose();
  }

  void _toggleMethod(String m) {
    setState(() {
      if (_methods.contains(m)) {
        _methods.remove(m);
      } else {
        _methods.add(m);
      }
    });
  }

  void _addCustom() {
    final v = _custom.text.trim();
    if (v.isEmpty) return;
    setState(() {
      final key = 'custom:$v';
      if (!_methods.contains(key)) _methods.add(key);
      _custom.clear();
    });
  }

  Future<void> _pickStart() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _startAt ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _startAt = picked);
  }

  Future<void> _pickDeadline() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _deadline ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _deadline = picked);
  }

  Future<void> _save() async {
    setState(() => _error = null);
    if (_title.text.trim().isEmpty) {
      setState(() => _error = '请输入活动名');
      return;
    }
    setState(() => _saving = true);
    try {
      final now = DateTime.now();
      final imagesJson = _imagesToJson(_imageText.text);
      final e = (widget.event ??
              TaoyuanEvent(
                id: const Uuid().v4(),
                ledgerId: widget.store.ledger.id,
                title: _title.text.trim(),
                publishedAt: now.millisecondsSinceEpoch,
                status: 'published',
                synced: 0,
                clientId: const Uuid().v4(),
                participate: _participate,
              ))
          .copyWith(
        title: _title.text.trim(),
        content: _content.text.trim().isEmpty ? null : _content.text.trim(),
        reward: _reward.text.trim().isEmpty ? null : _reward.text.trim(),
        topicTag: _topicTag.text.trim().isEmpty ? null : _topicTag.text.trim(),
        contentImages: imagesJson,
        rewardMethods: jsonEncode(_methods),
        note: _note.text.trim().isEmpty ? null : _note.text.trim(),
        participate: _participate,
        startAt: _startAt?.millisecondsSinceEpoch,
        deadline: _deadline?.millisecondsSinceEpoch,
        synced: 0,
      );

      EventAmount? initialAmount;
      final cents = money.Money.parseToCents(_amount.text);
      if (cents != null && cents > 0) {
        initialAmount = EventAmount(
          id: const Uuid().v4(),
          eventId: e.id,
          stage: _stage,
          cents: cents,
          rewardMethod: _amountMethod,
          occurredAt: now.millisecondsSinceEpoch,
          synced: 0,
        );
      }

      if (widget.event == null) {
        await widget.store.addEvent(e, initialAmount: initialAmount);
      } else {
        await widget.store.updateEvent(e);
        if (initialAmount != null) {
          await widget.store.addAmount(
            eventId: e.id,
            stage: initialAmount.stage,
            cents: initialAmount.cents,
            rewardMethod: initialAmount.rewardMethod,
          );
        }
      }
      if (mounted) Navigator.pop(context);
    } catch (err) {
      if (mounted) {
        setState(() => _error = err is Exception ? err.toString() : '保存失败');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: ink500,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text(
              widget.event == null ? '新活动' : '编辑活动',
              style: TextStyle(color: ink900, fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            _Field(label: '活动名 *', child: AppTextField(hint: '活动名', controller: _title)),
            _Field(
              label: '活动时间',
              child: Row(
                children: [
                  Expanded(
                    child: _DateField(
                      label: '开始',
                      value: _startAt,
                      isDark: isDark,
                      onTap: _pickStart,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _DateField(
                      label: '截止',
                      value: _deadline,
                      isDark: isDark,
                      onTap: _pickDeadline,
                    ),
                  ),
                ],
              ),
            ),
            _Field(
              label: '活动图片链接（每行一个 URL）',
              child: AppTextField(hint: 'https://...', controller: _imageText),
            ),
            _Field(
              label: '活动奖励描述',
              child: AppTextField(hint: '例如：1000 元 或 500 京东卡', controller: _reward),
            ),
            _Field(
              label: '奖励发放方式（多选）',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _kRewardMethods
                        .map(
                          (m) => _SelectChip(
                            label: rewardMethodLabel(m),
                            selected: _methods.contains(m),
                            onTap: () => _toggleMethod(m),
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: AppTextField(hint: '自定义方式（如：礼盒）', controller: _custom),
                      ),
                      const SizedBox(width: 8),
                      TextButton(onPressed: _addCustom, child: const Text('加')),
                    ],
                  ),
                  if (_methods.where((m) => m.startsWith('custom:')).isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: _methods
                            .where((m) => m.startsWith('custom:'))
                            .map(
                              (m) => _SelectChip(
                                label: rewardMethodLabel(m),
                                selected: true,
                                onTap: () => _toggleMethod(m),
                              ),
                            )
                            .toList(),
                      ),
                    ),
                ],
              ),
            ),
            _Field(
              label: '话题 tag（用于一键复制）',
              child: AppTextField(hint: '#桃源xxx 挑战 @xxx', controller: _topicTag),
            ),
            _Field(label: '备注', child: AppTextField(hint: '备注', controller: _note)),
            // 初始金额（Save → insertAmount）
            const SizedBox(height: 8),
            Text('初始奖励金额（可选）',
                style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 6),
            Row(
              children: _kRewardMethods
                  .map(
                    (m) => Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2),
                        child: _SelectChip(
                          label: rewardMethodLabel(m),
                          selected: _amountMethod == m,
                          onTap: () => setState(() => _amountMethod = m),
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 8),
            AppTextField(hint: '0.00', controller: _amount),
            const SizedBox(height: 8),
            _SegmentedStage(
              value: _stage,
              onChanged: (v) => setState(() => _stage = v),
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('参与并在首页提醒',
                  style: TextStyle(color: ink900, fontSize: 14)),
              value: _participate,
              onChanged: (v) => setState(() => _participate = v),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: const TextStyle(color: AppColors.lightSemanticRed)),
              ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('取消'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: AppPrimaryButton(
                    label: _saving ? '保存中…' : '保存',
                    onPressed: _saving ? null : _save,
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

class _Field extends StatelessWidget {
  final String label;
  final Widget child;
  const _Field({required this.label, required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: ink500, fontSize: 12)),
          const SizedBox(height: 6),
          child,
        ],
      ),
    );
  }
}

/// 日期选择按钮（开始 / 截止），对齐网页端 EditEventModal 的 datetime 字段。
class _DateField extends StatelessWidget {
  final String label;
  final DateTime? value;
  final bool isDark;
  final VoidCallback onTap;
  const _DateField({
    required this.label,
    required this.value,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightInk100;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = value == null
        ? '选择日期'
        : '${value!.year}/${value!.month}/${value!.day}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: ink500, fontSize: 10)),
        const SizedBox(height: 4),
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
            decoration: BoxDecoration(
              color: surface,
              border: Border.all(color: border),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              text,
              style: TextStyle(color: ink900, fontSize: 13),
            ),
          ),
        ),
      ],
    );
  }
}

class _SelectChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _SelectChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fill = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final text = isDark ? AppColors.darkPageBg : AppColors.lightSurface;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightInk100;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? fill : surface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? text : ink500,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}

class _SegmentedStage extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;
  const _SegmentedStage({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fill = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final text = isDark ? AppColors.darkPageBg : AppColors.lightSurface;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Row(
        children: ['predicted', 'announced', 'paid']
            .map(
              (s) => Expanded(
                child: GestureDetector(
                  onTap: () => onChanged(s),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: value == s ? fill : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Center(
                      child: Text(
                        _kStageLabel[s]!,
                        style: TextStyle(
                          color: value == s ? text : ink500,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

// ───────────────────────── 阶段明细弹层（金额列表 + 增删改） ─────────────────────────

class StageDetailSheet extends StatefulWidget {
  final _TaoyuanStore store;
  final TaoyuanEvent event;
  final String stage;
  const StageDetailSheet({
    super.key,
    required this.store,
    required this.event,
    required this.stage,
  });

  @override
  State<StageDetailSheet> createState() => _StageDetailSheetState();
}

class _StageDetailSheetState extends State<StageDetailSheet> {
  List<EventAmount> get _amts => widget.store
      .amountsByEvent[widget.event.id]
      ?.where((a) => a.stage == widget.stage)
      .toList() ??
      const <EventAmount>[];

  Future<void> _confirmDelete(EventAmount a) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('删除这条金额？'),
        content: Text(_amountText(a)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (ok == true && mounted) await widget.store.deleteAmount(a);
  }

  void _openAmount([EventAmount? amount]) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChangeNotifierProvider.value(
        value: widget.store,
        child: AmountSheet(
          store: widget.store,
          event: widget.event,
          stage: widget.stage,
          amount: amount,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // 监听 store 变化，金额增删后自动刷新。
    final _ = context.watch<_TaoyuanStore>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final fill = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final text = isDark ? AppColors.darkPageBg : AppColors.lightSurface;

    final moneySum = _amts
        .where((a) => rewardValueKind(a.rewardMethod) == 'money')
        .fold(0, (int s, EventAmount a) => s + a.cents);

    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: ink500,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _kStageLabel[widget.stage]!,
                  style: TextStyle(color: ink900, fontSize: 18, fontWeight: FontWeight.w600),
                ),
                Money(
                  cents: moneySum,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ..._amts.map(
              (a) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(child: _AmountValue(a, ink900)),
                        Row(
                          children: [
                            TextButton(
                              onPressed: () => _openAmount(a),
                              child: const Text('改'),
                            ),
                            TextButton(
                              onPressed: () => _confirmDelete(a),
                              child: const Text('删', style: TextStyle(color: AppColors.lightSemanticRed)),
                            ),
                          ],
                        ),
                      ],
                    ),
                    Text(
                      '${_fmt(a.occurredAt) ?? ''}${a.rewardMethod != null && a.rewardMethod!.isNotEmpty ? ' · ${rewardMethodLabel(a.rewardMethod)}' : ''}',
                      style: TextStyle(color: ink400, fontSize: 11),
                    ),
                    if (a.note != null && a.note!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text('备注：${a.note}',
                            style: TextStyle(color: ink500, fontSize: 12)),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => _openAmount(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: fill,
                  foregroundColor: text,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('+ 添加一条'),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

String _amountText(EventAmount a) {
  final k = rewardValueKind(a.rewardMethod);
  if (k == 'money') return money.Money.formatCents(a.cents);
  if (k == 'count') return '${a.quantity ?? 0} ${rewardMethodLabel(a.rewardMethod)}';
  return a.itemDesc ?? rewardMethodLabel(a.rewardMethod);
}

class _AmountValue extends StatelessWidget {
  final EventAmount a;
  final Color ink900;
  const _AmountValue(this.a, this.ink900);

  @override
  Widget build(BuildContext context) {
    final k = rewardValueKind(a.rewardMethod);
    if (k == 'money') {
      return Money(
        cents: a.cents,
        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      );
    }
    if (k == 'count') {
      return Text(
        '${a.quantity ?? 0} ${rewardMethodLabel(a.rewardMethod)}',
        style: TextStyle(color: ink900, fontSize: 15, fontWeight: FontWeight.w600),
      );
    }
    return Text(
      a.itemDesc ?? rewardMethodLabel(a.rewardMethod),
      style: TextStyle(color: ink900, fontSize: 15, fontWeight: FontWeight.w600),
    );
  }
}

// ───────────────────────── 单条金额编辑弹层 ─────────────────────────

class AmountSheet extends StatefulWidget {
  final _TaoyuanStore store;
  final TaoyuanEvent event;
  final String stage;
  final EventAmount? amount;
  const AmountSheet({
    super.key,
    required this.store,
    required this.event,
    required this.stage,
    this.amount,
  });

  @override
  State<AmountSheet> createState() => _AmountSheetState();
}

class _AmountSheetState extends State<AmountSheet> {
  late List<String> _methods;
  late String _method;
  late final TextEditingController _amount;
  late final TextEditingController _quantity;
  late final TextEditingController _itemDesc;
  late final TextEditingController _note;
  late DateTime _at;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final a = widget.amount;
    _methods = parseRewardMethods(widget.event.rewardMethods, widget.event.rewardMethod);
    if (_methods.isEmpty) _methods = ['cash'];
    _method = a?.rewardMethod ?? _methods.first;
    _amount = TextEditingController(
      text: a != null ? (a.cents / 100).toStringAsFixed(2) : '',
    );
    _quantity = TextEditingController(text: a?.quantity?.toString() ?? '');
    _itemDesc = TextEditingController(text: a?.itemDesc ?? '');
    _note = TextEditingController(text: a?.note ?? '');
    _at = DateTime.fromMillisecondsSinceEpoch(a?.occurredAt ?? DateTime.now().millisecondsSinceEpoch);
  }

  @override
  void dispose() {
    _amount.dispose();
    _quantity.dispose();
    _itemDesc.dispose();
    _note.dispose();
    super.dispose();
  }

  String get _kind => rewardValueKind(_method);

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _at,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _at = picked);
  }

  Future<void> _save() async {
    setState(() => _error = null);
    final a = widget.amount;
    try {
      if (_kind == 'money') {
        final cents = money.Money.parseToCents(_amount.text);
        if (cents == null || cents == 0) {
          setState(() => _error = '金额格式不正确');
          return;
        }
        final amt = _build(cents: cents);
        if (a == null) {
          await widget.store.addAmount(
            eventId: widget.event.id,
            stage: widget.stage,
            cents: cents,
            rewardMethod: _method,
            note: _note.text.trim().isEmpty ? null : _note.text.trim(),
          );
        } else {
          await widget.store.updateAmount(amt);
        }
      } else if (_kind == 'count') {
        final q = int.tryParse(_quantity.text.trim());
        if (q == null || q <= 0) {
          setState(() => _error = '请填写正整数个数');
          return;
        }
        if (a == null) {
          await widget.store.addAmount(
            eventId: widget.event.id,
            stage: widget.stage,
            quantity: q,
            rewardMethod: _method,
            note: _note.text.trim().isEmpty ? null : _note.text.trim(),
          );
        } else {
          await widget.store.updateAmount(_build(quantity: q));
        }
      } else {
        final desc = _itemDesc.text.trim();
        if (desc.isEmpty) {
          setState(() => _error = '请填写奖励内容');
          return;
        }
        if (a == null) {
          await widget.store.addAmount(
            eventId: widget.event.id,
            stage: widget.stage,
            itemDesc: desc,
            rewardMethod: _method,
            note: _note.text.trim().isEmpty ? null : _note.text.trim(),
          );
        } else {
          await widget.store.updateAmount(_build(itemDesc: desc));
        }
      }
      if (mounted) Navigator.pop(context);
    } catch (err) {
      if (mounted) {
        setState(() => _error = err is Exception ? err.toString() : '保存失败');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  EventAmount _build({int? cents, int? quantity, String? itemDesc}) {
    final a = widget.amount;
    return EventAmount(
      id: a?.id ?? const Uuid().v4(),
      eventId: widget.event.id,
      stage: widget.stage,
      cents: cents ?? a?.cents ?? 0,
      quantity: quantity ?? a?.quantity,
      itemDesc: itemDesc ?? a?.itemDesc,
      note: _note.text.trim().isEmpty ? null : _note.text.trim(),
      rewardMethod: _method,
      occurredAt: DateTime(_at.year, _at.month, _at.day, 12, 0).millisecondsSinceEpoch,
      synced: 0,
    );
  }

  @override
  Widget build(BuildContext context) {
    final _ = context.watch<_TaoyuanStore>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final text = isDark ? AppColors.darkPageBg : AppColors.lightSurface;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;

    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: ink500,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text(
              widget.amount == null ? '添加金额' : '编辑金额',
              style: TextStyle(color: ink900, fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            if (_kind == 'money')
              AppTextField(hint: '0.00', controller: _amount)
            else if (_kind == 'count')
              AppTextField(
                hint: '个数（${rewardMethodLabel(_method)}）',
                controller: _quantity,
              )
            else
              AppTextField(hint: '奖励内容（如：限量手办）', controller: _itemDesc),
            const SizedBox(height: 12),
            Text('备注', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 6),
            AppTextField(hint: '备注', controller: _note),
            const SizedBox(height: 12),
            if (_methods.length > 1) ...[
              Text('奖励方式（此条金额）', style: TextStyle(color: ink500, fontSize: 12)),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _methods
                    .map(
                      (m) => _SelectChip(
                        label: rewardMethodLabel(m),
                        selected: _method == m,
                        onTap: () => setState(() => _method = m),
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 12),
            ],
            Text('操作时间', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 6),
            InkWell(
              onTap: _pickDate,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: surface,
                  border: Border.all(
                    color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  DateFormat('yyyy-MM-dd').format(_at),
                  style: TextStyle(color: ink900, fontSize: 15),
                ),
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: const TextStyle(color: AppColors.lightSemanticRed)),
              ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('取消'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: AppPrimaryButton(
                    label: _saving ? '…' : (widget.amount == null ? '添加' : '保存'),
                    onPressed: _saving ? null : _save,
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
