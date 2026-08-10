import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/money.dart' as money;
import '../../data/models/ledger.dart';
import '../../data/models/work_entry.dart';
import '../../state/work_state.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/money.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';

/// 工作账本·单月视图（对齐网页 /work/[month]：WorkMonthSection + NewEntryFlow + EntryRow + EditEntryModal）。
///
/// 给定账本 [ledger] 与月份 [month]（缺省为当前月），展示：
///   · 顶部汇总卡：进项 / 出项 / 结余 / 回款率（= 进项/出项）。
///   · "+ 记一笔" 打开记/改账底部弹层（方向、类别、金额、备注、操作时间）。
///   · 本月条目列表（EntryRow 风格：类别、金额、备注、时间；点按编辑、✕ 删除确认）。
class WorkLedgerPage extends StatelessWidget {
  final Ledger ledger;

  /// 目标月份 'YYYY-MM'；缺省为当前月（对齐网页 /work 预取 /work/[currentMonth]）。
  final String? month;

  const WorkLedgerPage({super.key, required this.ledger, this.month});

  /// 当前月 'YYYY-MM'（用于缺省月份）。
  static String currentMonth() {
    final n = DateTime.now();
    return '${n.year}-${n.month.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => WorkState(ledger)..load(),
      child: _Body(month: month ?? currentMonth()),
    );
  }
}

class _Body extends StatelessWidget {
  final String month;
  const _Body({required this.month});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<WorkState>();
    final ledger = state.ledger;

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;

    // 仅取本月、未删除的条目。
    final entries = state.entries
        .where((e) => e.yearMonth == month && e.deletedAt == null)
        .toList();
    int income = 0;
    int expense = 0;
    for (final e in entries) {
      if (e.direction == 'income') {
        income += e.amountCents;
      } else {
        expense += e.amountCents;
      }
    }
    final balance = income - expense;
    final rate = expense > 0
        ? (income / expense * 100).round()
        : (income > 0 ? 100 : 0);

    final parts = month.split('-');
    final yearLabel = parts[0];
    final monthLabel = int.parse(parts[1]);

    return Container(
      color: pageBg,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PageHeader(
                icon: '💼',
                title: '工作账本',
                subtitle: '$yearLabel 年 $monthLabel 月',
              ),

              // ---- 汇总卡（进项 / 出项 / 结余 / 回款率）----
              AppCard(
                radius: 24,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('$yearLabel 年',
                          style: TextStyle(color: ink500, fontSize: 12)),
                      const SizedBox(height: 2),
                      Text('$monthLabel 月',
                          style: TextStyle(
                              color: ink900,
                              fontSize: 28,
                              fontWeight: FontWeight.w700)),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: _Stat(
                              label: '进项',
                              cents: income,
                              sign: true,
                              color: green,
                            ),
                          ),
                          Expanded(
                            child: _Stat(
                              label: '出项',
                              cents: -expense,
                              sign: true,
                              color: red,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _Stat(
                              label: '结余',
                              cents: balance,
                              sign: true,
                              color: balance >= 0 ? green : red,
                            ),
                          ),
                          Expanded(
                            child: _Stat(
                              label: '回款率',
                              text: expense > 0 ? '$rate%' : '—',
                              color: ink900,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // ---- 记一笔 ----
              AppPrimaryButton(
                label: '+ 记一笔',
                onPressed: () => _openForm(context, state, month, null),
              ),
              const SizedBox(height: 8),

              SectionLabel('本月记录'),

              if (entries.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('还没有记录，点击上方 + 开始',
                      style: TextStyle(color: ink500, fontSize: 13)),
                )
              else
                ...entries.map((e) => _EntryCard(
                      entry: e,
                      income: e.direction == 'income',
                      green: green,
                      red: red,
                      ink900: ink900,
                      ink500: ink500,
                      onEdit: () => _openForm(context, state, month, e),
                      onDelete: () => _confirmDelete(context, state, e),
                    )),
            ],
          ),
        ),
      ),
    );
  }

  void _openForm(
      BuildContext context, WorkState state, String ym, WorkEntry? e) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EntryFormSheet(state: state, yearMonth: ym, editing: e),
    );
  }

  Future<void> _confirmDelete(
      BuildContext context, WorkState state, WorkEntry e) async {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('删除这笔「${e.category}」？'),
        content: Text('${money.Money.formatPlain(e.amountCents)} 元'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text('删除', style: TextStyle(color: red)),
          ),
        ],
      ),
    );
    if (ok == true) await state.deleteEntry(e);
  }
}

/// 汇总小块（标签 + 金额 / 文本）。
class _Stat extends StatelessWidget {
  final String label;
  final int cents;
  final String? text;
  final bool sign;
  final Color color;

  const _Stat({
    required this.label,
    this.cents = 0,
    this.text,
    this.sign = false,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: ink500, fontSize: 12)),
        const SizedBox(height: 4),
        text != null
            ? Text(text!,
                style: TextStyle(
                    color: color, fontSize: 18, fontWeight: FontWeight.w700))
            : Money(
                cents: cents,
                sign: sign,
                style: TextStyle(
                    color: color, fontSize: 18, fontWeight: FontWeight.w700),
              ),
      ],
    );
  }
}

/// 单条记录的卡片（对齐网页 EntryRow）。
class _EntryCard extends StatelessWidget {
  final WorkEntry entry;
  final bool income;
  final Color green;
  final Color red;
  final Color ink900;
  final Color ink500;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _EntryCard({
    required this.entry,
    required this.income,
    required this.green,
    required this.red,
    required this.ink900,
    required this.ink500,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final amountColor = income ? green : red;
    final dateStr = DateFormat('yyyy-MM-dd HH:mm')
        .format(DateTime.fromMillisecondsSinceEpoch(entry.occurredAt));

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        radius: 16,
        onTap: onEdit,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(entry.category,
                        style: TextStyle(
                            color: ink900,
                            fontSize: 15,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(dateStr, style: TextStyle(color: ink500, fontSize: 11)),
                    if (entry.note != null && entry.note!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(entry.note!,
                            style: TextStyle(color: ink500, fontSize: 12)),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Money(
                cents: income ? entry.amountCents : -entry.amountCents,
                sign: true,
                style: TextStyle(
                    color: amountColor,
                    fontSize: 16,
                    fontWeight: FontWeight.w700),
              ),
              const SizedBox(width: 4),
              IconButton(
                onPressed: onEdit,
                icon: Icon(Icons.edit_outlined, size: 18, color: ink500),
                constraints: const BoxConstraints(),
                padding: const EdgeInsets.symmetric(horizontal: 6),
                tooltip: '编辑',
              ),
              IconButton(
                onPressed: onDelete,
                icon: Icon(Icons.close, size: 18, color: red),
                constraints: const BoxConstraints(),
                padding: const EdgeInsets.symmetric(horizontal: 2),
                tooltip: '删除',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 记/改账底部弹层（对齐网页 NewEntryFlow + EditEntryModal）。
class _EntryFormSheet extends StatefulWidget {
  final WorkState state;
  final String yearMonth;
  final WorkEntry? editing;

  const _EntryFormSheet({
    required this.state,
    required this.yearMonth,
    this.editing,
  });

  @override
  State<_EntryFormSheet> createState() => _EntryFormSheetState();
}

class _EntryFormSheetState extends State<_EntryFormSheet> {
  // 预设类别（对齐网页 src/lib/categories.ts）。
  static const List<Map<String, String>> _presets = [
    {'name': '月工资', 'direction': 'income'},
    {'name': '奖金', 'direction': 'income'},
    {'name': '协同', 'direction': 'income'},
    {'name': '房贷垫款', 'direction': 'expense'},
    {'name': '消费贷垫款', 'direction': 'expense'},
    {'name': '存款垫款', 'direction': 'expense'},
  ];

  late String _direction;
  late String _category;
  bool _customMode = false;
  late DateTime _occurredAt;
  final _customName = TextEditingController();
  final _amount = TextEditingController();
  final _note = TextEditingController();
  String _error = '';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.editing;
    if (e != null) {
      _direction = e.direction;
      _category = e.category;
      _customMode = !_presets.any((p) => p['name'] == e.category);
      _amount.text = (e.amountCents / 100).toStringAsFixed(2);
      _note.text = e.note ?? '';
      _occurredAt = DateTime.fromMillisecondsSinceEpoch(e.occurredAt);
    } else {
      _direction = 'income';
      _category =
          _presets.firstWhere((p) => p['direction'] == 'income')['name']!;
      _occurredAt = defaultOccurredAtFor(widget.yearMonth);
    }
  }

  @override
  void dispose() {
    _customName.dispose();
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  List<Map<String, String>> get _directionPresets =>
      _presets.where((p) => p['direction'] == _direction).toList();

  void _pickPreset(String name) => setState(() {
        _category = name;
        _customMode = false;
      });

  void _switchDirection(String d) {
    if (d == _direction) return;
    setState(() {
      _direction = d;
      final stillValid =
          _presets.any((p) => p['name'] == _category && p['direction'] == d);
      if (!stillValid && !_customMode) {
        final first = _presets.firstWhere((p) => p['direction'] == d);
        _category = first['name']!;
      }
    });
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _occurredAt,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() {
        _occurredAt = DateTime(picked.year, picked.month, picked.day,
            _occurredAt.hour, _occurredAt.minute);
      });
    }
  }

  Future<void> _save() async {
    setState(() => _error = '');
    final cents = money.Money.parseToCents(_amount.text);
    if (cents == null || cents == 0) {
      setState(() => _error = '金额格式不正确或不能为 0');
      return;
    }
    final finalCategory = _customMode ? _customName.text.trim() : _category;
    if (finalCategory.isEmpty) {
      setState(() => _error = '请选择或输入类别');
      return;
    }
    setState(() => _saving = true);
    try {
      final occurredAt = _occurredAt.millisecondsSinceEpoch;
      final note = _note.text.trim().isEmpty ? null : _note.text.trim();
      if (widget.editing == null) {
        await widget.state.addEntry(
          direction: _direction,
          category: finalCategory,
          amountCents: cents,
          note: note,
          occurredAt: occurredAt,
        );
      } else {
        final e = widget.editing!;
        final updated = WorkEntry(
          id: e.id,
          ledgerId: e.ledgerId,
          serverId: e.serverId,
          yearMonth: _yearMonth(occurredAt),
          category: finalCategory,
          direction: _direction,
          amountCents: cents,
          note: note,
          occurredAt: occurredAt,
          refundedAt: e.refundedAt,
          deletedAt: e.deletedAt,
          synced: 0,
          clientId: e.clientId ?? e.id,
        );
        await widget.state.updateEntry(updated);
      }
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) setState(() => _error = '保存失败，请重试');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    final dateStr = DateFormat('yyyy-MM-dd HH:mm').format(_occurredAt);
    final selectedFg = isDark ? AppColors.darkPageBg : Colors.white;

    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        left: 20,
        right: 20,
        top: 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.editing == null ? '记一笔' : '编辑记录',
                style: TextStyle(
                    color: ink900, fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),

            // 方向
            Text('方向', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 6),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'income', label: Text('进项')),
                ButtonSegment(value: 'expense', label: Text('出项')),
              ],
              selected: {_direction},
              onSelectionChanged: (s) => _switchDirection(s.first),
            ),
            const SizedBox(height: 14),

            // 类别
            Text('类别', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 6),
            if (_customMode)
              Row(children: [
                Expanded(
                  child: TextField(
                    controller: _customName,
                    decoration: _fieldDecoration(
                        hint: '自定义类别名', surface: surface, border: border, ink500: ink500),
                  ),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: () => setState(() {
                    _customMode = false;
                    final first = _presets.firstWhere(
                        (p) => p['direction'] == _direction);
                    _category = first['name']!;
                  }),
                  child: const Text('选预设'),
                ),
              ])
            else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ..._directionPresets.map(
                    (p) => ChoiceChip(
                      label: Text(p['name']!),
                      selected: _category == p['name'],
                      selectedColor:
                          isDark ? AppColors.darkInk100 : AppColors.lightInk900,
                      labelStyle: TextStyle(
                        color: _category == p['name'] ? selectedFg : ink900,
                      ),
                      onSelected: (_) => _pickPreset(p['name']!),
                    ),
                  ),
                  ActionChip(
                    label: const Text('+ 自定义类别'),
                    onPressed: () => setState(() => _customMode = true),
                  ),
                ],
              ),
            const SizedBox(height: 14),

            // 金额
            Text('金额（元）', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 6),
            TextField(
              controller: _amount,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: _fieldDecoration(
                hint: '0.00',
                surface: surface,
                border: border,
                ink500: ink500,
                prefix: '¥',
              ),
            ),
            const SizedBox(height: 14),

            // 备注
            Text('备注（可选）',
                style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 6),
            TextField(
              controller: _note,
              maxLength: 200,
              decoration: _fieldDecoration(
                hint: '备注',
                surface: surface,
                border: border,
                ink500: ink500,
              ),
            ),
            const SizedBox(height: 14),

            // 操作时间
            Text('操作时间', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 6),
            InkWell(
              onTap: _pickDate,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: border),
                ),
                child: Text(dateStr, style: TextStyle(color: ink900)),
              ),
            ),

            if (_error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child:
                    Text(_error, style: TextStyle(color: red, fontSize: 13)),
              ),
            const SizedBox(height: 16),

            Row(children: [
              Expanded(
                child: TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text('取消', style: TextStyle(color: ink500)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: AppPrimaryButton(
                  label: _saving ? '保存中…' : '保存',
                  onPressed: _saving ? null : _save,
                ),
              ),
            ]),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  InputDecoration _fieldDecoration({
    required String hint,
    required Color surface,
    required Color border,
    required Color ink500,
    String? prefix,
  }) =>
      InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: ink500),
        prefixText: prefix,
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: border),
        ),
        contentPadding: const EdgeInsets.all(16),
      );
}

/// 'YYYY-MM' 由 occurredAt 推导。
String _yearMonth(int occurredAt) {
  final d = DateTime.fromMillisecondsSinceEpoch(occurredAt);
  return '${d.year}-${d.month.toString().padLeft(2, '0')}';
}

/// 对齐网页 lib/datetime.ts 的 defaultOccurredAtFor：
/// 当月→此刻；过去月→该月最后一天 12:00；未来月→该月 1 号 12:00。
DateTime defaultOccurredAtFor(String yearMonth, [DateTime? now]) {
  now ??= DateTime.now();
  final m = RegExp(r'^(\d{4})-(0[1-9]|1[0-2])$').firstMatch(yearMonth);
  if (m == null) return now;
  final year = int.parse(m.group(1)!);
  final month = int.parse(m.group(2)!);
  if (now.year == year && now.month == month) return now;
  final isPast =
      year < now.year || (year == now.year && month < now.month);
  return isPast
      ? DateTime(year, month + 1, 0, 12, 0)
      : DateTime(year, month, 1, 12, 0);
}
