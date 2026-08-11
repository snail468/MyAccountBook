import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../core/money.dart' as money;
import '../../theme/design_tokens.dart';
import '../../state/theme_state.dart';
import '../../data/local/ledger_dao.dart';
import '../../data/models/ledger.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/page_header.dart';

/// 账本管理页（设计 2:136 / 网页 src/app/ledgers）。
///
/// 本地优先：直接读 [LedgerDao.listAllIncludingDeleted]，软删 / 彻底删除 /
/// 新建均走 [LedgerDao]（恢复用 [LedgerDao.upsert] 清 deleted_at）。无新依赖。
class ManageLedgersPage extends StatefulWidget {
  const ManageLedgersPage({super.key});

  @override
  State<ManageLedgersPage> createState() => _ManageLedgersPageState();
}

class _ManageLedgersPageState extends State<ManageLedgersPage> {
  final List<Ledger> _all = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final list = await LedgerDao().listAllIncludingDeleted();
    if (!mounted) return;
    _all
      ..clear()
      ..addAll(list);
    _loading = false;
    setState(() {});
  }

  Future<void> _softDelete(Ledger l) async {
    final ok = await _confirm(
      context,
      title: '把「${l.name}」放入回收站？',
      body: '首页不再显示。60 天内可恢复；恢复后原有数据完整保留。',
      confirmText: '放入回收站',
    );
    if (!ok || !mounted) return;
    await LedgerDao().softDelete(l.id);
    await _load();
  }

  Future<void> _restore(Ledger l) async {
    await LedgerDao().upsert(l.copyWith(deletedAt: null, synced: 0));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('已恢复')));
    await _load();
  }

  Future<void> _purge(Ledger l) async {
    final ok = await _confirm(
      context,
      title: '永久删除「${l.name}」？',
      body: '该账本所有记录会立即一并销毁，此操作不可恢复！',
      confirmText: '永久删除',
    );
    if (!ok || !mounted) return;
    await LedgerDao().delete(l.id);
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('已永久删除')));
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    context.watch<ThemeState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final headColor = isDark ? AppColors.darkInk500 : AppColors.lightInk700;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;

    final active = _all.where((l) => l.deletedAt == null).toList();
    final recycled = _all.where((l) => l.deletedAt != null).toList();

    final maxOrder = _all.isEmpty
        ? 0
        : _all.map((l) => l.order).reduce((a, b) => a > b ? a : b);
    final hasWork = active.any((l) => l.kind == 'work');
    final hasTaoyuan = active.any((l) => l.kind == 'taoyuan');

    return Scaffold(
      body: Container(
        color: pageBg,
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const PageHeader(
                  icon: '📚',
                  title: '账本',
                  subtitle: '添加 / 删除账本 · 回收站',
                ),

                // ① 我的账本
                _sectionTitle('我的账本', '${active.length} 个', headColor, ink400),
                const SizedBox(height: 8),
                if (_loading)
                  _hint('加载中…', ink400)
                else if (active.isEmpty)
                  _hint('还没有账本，从下方添加一个', ink500)
                else
                  ...active.map(
                    (l) => _LedgerTile(
                      ledger: l,
                      ink900: ink900,
                      ink500: ink500,
                      red: red,
                      onDelete: _softDelete,
                    ),
                  ),

                const SizedBox(height: 16),

                // ② 添加账本
                _sectionTitle('添加账本', null, headColor, ink400),
                const SizedBox(height: 8),
                AppPrimaryButton(
                  label: '＋ 添加账本',
                  onPressed: () => showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    backgroundColor: Colors.transparent,
                    builder: (_) => _AddLedgerSheet(
                      maxOrder: maxOrder,
                      hasWork: hasWork,
                      hasTaoyuan: hasTaoyuan,
                    ),
                  ).then((_) {
                    if (mounted) _load();
                  }),
                ),

                const SizedBox(height: 16),

                // ③ 回收站
                _sectionTitle(
                  '回收站',
                  recycled.isEmpty
                      ? '空'
                      : '${recycled.length} 个 · 60 天后自动清空',
                  headColor,
                  ink400,
                ),
                const SizedBox(height: 8),
                if (recycled.isEmpty)
                  _hint('回收站是空的', ink500)
                else
                  ...recycled.map(
                    (l) => _RecycledTile(
                      ledger: l,
                      ink400: ink400,
                      ink500: ink500,
                      red: red,
                      green: green,
                      onRestore: _restore,
                      onPurge: _purge,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Widget _sectionTitle(String label, String? trailing, Color head, Color sub) =>
    Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: TextStyle(color: head, fontSize: 15, fontWeight: FontWeight.w600)),
        if (trailing != null)
          Text(trailing, style: TextStyle(color: sub, fontSize: 12)),
      ],
    );

Widget _hint(String text, Color color) => Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text(text, style: TextStyle(color: color, fontSize: 13)),
    );

String _kindLabel(String kind) {
  switch (kind) {
    case 'work':
      return '工作账本';
    case 'taoyuan':
      return '桃源账本';
    case 'general':
      return '普通账本';
    case 'travel':
      return '旅游账本';
    default:
      return kind;
  }
}

int _daysLeft(int? deletedAt) {
  if (deletedAt == null) return 60;
  const retention = 60 * 24 * 60 * 60 * 1000;
  final cutoff = deletedAt + retention;
  final ms = cutoff - DateTime.now().millisecondsSinceEpoch;
  return ms <= 0 ? 0 : (ms / (24 * 60 * 60 * 1000)).ceil();
}

// ───────────────────────── 预设 / 图标 / 币种常量（对齐网页端 PresetPicker） ─────────────────────────

/// 预设账本（含「自定义账本」）。desc 仅用于创建表单的副标题。
const List<({String title, String icon, String kind, String desc})> _kPresets = [
  (
    title: '工作账本',
    icon: '💼',
    kind: 'work',
    desc: '按月记录进项与出项，用于工资、垫款等',
  ),
  (
    title: '桃源账本',
    icon: '🌸',
    kind: 'taoyuan',
    desc: '活动流水线：发布 → 预测 → 公示 → 到账',
  ),
  (
    title: '普通账本',
    icon: '📒',
    kind: 'general',
    desc: '日常收支：餐饮/交通/购物…含月度预算与统计',
  ),
  (
    title: '旅游账本',
    icon: '✈️',
    kind: 'travel',
    desc: '按行程组织：多币种 + 多人 AA + 最优结算',
  ),
  (
    title: '自定义账本',
    icon: '📝',
    kind: 'general',
    desc: '基于普通账本模型，自选名称与图标',
  ),
];

const List<String> _kLedgerIcons = [
  '📒', '💰', '🎁', '🎬', '🍜', '🏠', '🚗', '📚', '💄', '🎮', '🐱', '💎',
];

const List<({String code, String label})> _kCurrencies = [
  (code: 'CNY', label: '人民币 ¥'),
  (code: 'USD', label: '美元 \$'),
  (code: 'JPY', label: '日元 ¥'),
  (code: 'EUR', label: '欧元 €'),
  (code: 'GBP', label: '英镑 £'),
  (code: 'HKD', label: '港币 HK\$'),
  (code: 'TWD', label: '新台币 NT\$'),
  (code: 'KRW', label: '韩元 ₩'),
  (code: 'SGD', label: '新加坡元 S\$'),
  (code: 'THB', label: '泰铢 ฿'),
  (code: 'AUD', label: '澳元 A\$'),
  (code: 'CAD', label: '加元 C\$'),
  (code: 'CHF', label: '瑞士法郎 CHF'),
  (code: 'MYR', label: '马来西亚林吉特 RM'),
  (code: 'IDR', label: '印尼盾 Rp'),
  (code: 'VND', label: '越南盾 ₫'),
];

// ───────────────────────── 账本卡片 ─────────────────────────

class _LedgerTile extends StatelessWidget {
  final Ledger ledger;
  final Color ink900;
  final Color ink500;
  final Color red;
  final Future<void> Function(Ledger) onDelete;

  const _LedgerTile({
    required this.ledger,
    required this.ink900,
    required this.ink500,
    required this.red,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: AppCard(
          frosted: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Text(ledger.icon ?? '📒',
                    style: TextStyle(fontSize: 24, color: ink900)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ledger.name,
                          style: TextStyle(color: ink900, fontSize: 15)),
                      const SizedBox(height: 2),
                      Text(_kindLabel(ledger.kind),
                          style: TextStyle(color: ink500, fontSize: 13)),
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () => onDelete(ledger),
                  child: Text('删除',
                      style: TextStyle(color: red, fontSize: 13)),
                ),
              ],
            ),
          ),
        ),
      );
}

class _RecycledTile extends StatelessWidget {
  final Ledger ledger;
  final Color ink400;
  final Color ink500;
  final Color red;
  final Color green;
  final Future<void> Function(Ledger) onRestore;
  final Future<void> Function(Ledger) onPurge;

  const _RecycledTile({
    required this.ledger,
    required this.ink400,
    required this.ink500,
    required this.red,
    required this.green,
    required this.onRestore,
    required this.onPurge,
  });

  @override
  Widget build(BuildContext context) {
    final days = _daysLeft(ledger.deletedAt);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        frosted: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(ledger.icon ?? '📒',
                      style: TextStyle(fontSize: 24, color: ink400)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          ledger.name,
                          style: TextStyle(
                            color: ink400,
                            fontSize: 15,
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${_kindLabel(ledger.kind)} · '
                          '${days > 0 ? '还有 $days 天自动清除' : '即将清除'}',
                          style: TextStyle(color: ink500, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _ActionButton(
                      label: '恢复',
                      color: green,
                      onTap: () => onRestore(ledger),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _ActionButton(
                      label: '永久删除',
                      color: red,
                      onTap: () => onPurge(ledger),
                    ),
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

class _ActionButton extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _ActionButton({
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            border: Border.all(color: color.withOpacity(0.4)),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Text(label,
                style: TextStyle(color: color, fontSize: 13)),
          ),
        ),
      );
}

// ───────────────────────── 添加账本：两步式（预设 → 配置） ─────────────────────────

class _AddLedgerSheet extends StatefulWidget {
  final int maxOrder;
  final bool hasWork;
  final bool hasTaoyuan;

  const _AddLedgerSheet({
    required this.maxOrder,
    required this.hasWork,
    required this.hasTaoyuan,
  });

  @override
  State<_AddLedgerSheet> createState() => _AddLedgerSheetState();
}

class _AddLedgerSheetState extends State<_AddLedgerSheet> {
  int _step = 0;
  ({String title, String icon, String kind, String desc})? _picked;
  late final TextEditingController _name;
  late final TextEditingController _budget;
  String _icon = '📒';
  String _currency = 'CNY';
  DateTime? _startAt;
  DateTime? _endAt;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController();
    _budget = TextEditingController();
  }

  @override
  void dispose() {
    _name.dispose();
    _budget.dispose();
    super.dispose();
  }

  void _pick(({String title, String icon, String kind, String desc}) p) {
    setState(() {
      _picked = p;
      _name.text = p.title;
      _icon = p.icon;
      _budget.clear();
      _currency = 'CNY';
      _startAt = null;
      _endAt = null;
      _error = null;
      _step = 1;
    });
  }

  Future<void> _pickDate(bool isStart) async {
    final initial = isStart ? _startAt : _endAt;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() {
        if (isStart) {
          _startAt = picked;
        } else {
          _endAt = picked;
        }
      });
    }
  }

  Future<void> _submit() async {
    final p = _picked;
    if (p == null) return;
    setState(() => _error = null);
    if (_name.text.trim().isEmpty) {
      setState(() => _error = '请填写账本名');
      return;
    }
    int? budgetCents;
    if (p.kind == 'general' && _budget.text.trim().isNotEmpty) {
      final cents = money.Money.parseToCents(_budget.text);
      if (cents == null || cents < 0) {
        setState(() => _error = '预算格式不正确');
        return;
      }
      budgetCents = cents;
    }
    setState(() => _saving = true);
    try {
      final ledger = Ledger(
        id: const Uuid().v4(),
        kind: p.kind,
        name: _name.text.trim(),
        icon: _icon,
        order: widget.maxOrder + 1,
        synced: 0,
        budgetCents: budgetCents,
        baseCurrency: p.kind == 'travel' ? _currency : null,
        startDate: p.kind == 'travel' ? _startAt?.millisecondsSinceEpoch : null,
        endDate: p.kind == 'travel' ? _endAt?.millisecondsSinceEpoch : null,
      );
      await LedgerDao().upsert(ledger);
      if (mounted) Navigator.pop(context);
    } catch (err) {
      if (mounted) {
        setState(() => _error = err is Exception ? err.toString() : '创建失败');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
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
    final fill = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final textOnFill = isDark ? AppColors.darkPageBg : AppColors.lightSurface;
    final iconBoxBg = isDark ? AppColors.darkSurface : AppColors.lightInk100;

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
            if (_step == 0)
              ..._kPresets.map((p) {
                final disabled = (p.kind == 'work' && widget.hasWork) ||
                    (p.kind == 'taoyuan' && widget.hasTaoyuan);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: AppCard(
                    frosted: false,
                    onTap: disabled ? null : () => _pick(p),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              color: iconBoxBg,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Center(
                              child: Text(p.icon, style: const TextStyle(fontSize: 24)),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(p.title,
                                        style: TextStyle(
                                            color: ink900, fontSize: 15)),
                                    if (disabled)
                                      Padding(
                                        padding: const EdgeInsets.only(left: 8),
                                        child: Text('已添加',
                                            style: TextStyle(
                                                color: ink400, fontSize: 11)),
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 2),
                                Text(p.desc,
                                    style: TextStyle(
                                        color: ink500, fontSize: 12)),
                              ],
                            ),
                          ),
                          if (!disabled)
                            Text('›',
                                style: TextStyle(color: ink500, fontSize: 20)),
                        ],
                      ),
                    ),
                  ),
                );
              })
            else
              _configForm(
                p: _picked!,
                ink500: ink500,
                ink900: ink900,
                surface: surface,
                border: border,
                fill: fill,
                textOnFill: textOnFill,
                iconBoxBg: iconBoxBg,
              ),
          ],
        ),
      ),
    );
  }

  Widget _configForm({
    required ({String title, String icon, String kind, String desc}) p,
    required Color ink500,
    required Color ink900,
    required Color surface,
    required Color border,
    required Color fill,
    required Color textOnFill,
    required Color iconBoxBg,
  }) {
    final isGeneral = p.kind == 'general';
    final isTravel = p.kind == 'travel';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: () => setState(() {
            _step = 0;
            _picked = null;
          }),
          child: Text('‹ 换一个',
              style: TextStyle(color: ink500, fontSize: 14)),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: iconBoxBg,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Center(
                child: Text(_icon, style: const TextStyle(fontSize: 24)),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.title, style: TextStyle(color: ink900, fontSize: 16)),
                  const SizedBox(height: 2),
                  Text(p.desc, style: TextStyle(color: ink500, fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Text('账本名', style: TextStyle(color: ink500, fontSize: 12)),
        const SizedBox(height: 6),
        AppTextField(hint: '账本名', controller: _name),
        const SizedBox(height: 12),
        Text('图标', style: TextStyle(color: ink500, fontSize: 12)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _kLedgerIcons
              .map(
                (i) => InkWell(
                  onTap: () => setState(() => _icon = i),
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: _icon == i ? fill : iconBoxBg,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Center(
                      child: Text(i,
                          style: TextStyle(
                            fontSize: 22,
                            color: _icon == i ? textOnFill : ink900,
                          )),
                    ),
                  ),
                ),
              )
              .toList(),
        ),
        if (isGeneral) ...[
          const SizedBox(height: 16),
          Text('月度预算（可选，元）',
              style: TextStyle(color: ink500, fontSize: 12)),
          const SizedBox(height: 6),
          AppTextField(hint: '0', controller: _budget),
        ],
        if (isTravel) ...[
          const SizedBox(height: 16),
          Text('本币', style: TextStyle(color: ink500, fontSize: 12)),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: iconBoxBg,
              border: Border.all(color: border),
              borderRadius: BorderRadius.circular(16),
            ),
            child: DropdownButton<String>(
              value: _currency,
              isExpanded: true,
              underline: const SizedBox.shrink(),
              items: _kCurrencies
                  .map(
                    (c) => DropdownMenuItem(
                      value: c.code,
                      child: Text(c.label,
                          style: TextStyle(color: ink900, fontSize: 14)),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _currency = v ?? 'CNY'),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('起始', style: TextStyle(color: ink500, fontSize: 10)),
                    const SizedBox(height: 4),
                    _DateButton(
                      label: _startAt == null
                          ? '选择日期'
                          : '${_startAt!.year}/${_startAt!.month}/${_startAt!.day}',
                      onTap: () => _pickDate(true),
                      ink900: ink900,
                      border: border,
                      surface: iconBoxBg,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('结束', style: TextStyle(color: ink500, fontSize: 10)),
                    const SizedBox(height: 4),
                    _DateButton(
                      label: _endAt == null
                          ? '选择日期'
                          : '${_endAt!.year}/${_endAt!.month}/${_endAt!.day}',
                      onTap: () => _pickDate(false),
                      ink900: ink900,
                      border: border,
                      surface: iconBoxBg,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(_error!, style: const TextStyle(color: AppColors.lightSemanticRed)),
          ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _saving ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: fill,
              foregroundColor: textOnFill,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: Text(_saving ? '创建中…' : '创建账本'),
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}

class _DateButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final Color ink900;
  final Color border;
  final Color surface;

  const _DateButton({
    required this.label,
    required this.onTap,
    required this.ink900,
    required this.border,
    required this.surface,
  });

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: surface,
            border: Border.all(color: border),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            label,
            style: TextStyle(color: ink900, fontSize: 13),
            textAlign: TextAlign.center,
          ),
        ),
      );
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
