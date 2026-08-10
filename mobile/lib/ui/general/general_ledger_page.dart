import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/general_categories.dart' show iconOf, defaultCategories, CustomCategories;
import '../../core/money.dart' as money;
import '../../data/models/general_entry.dart';
import '../../data/models/ledger.dart';
import '../../state/general_state.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/money.dart';
import '../widgets/page_header.dart';

/// 普通账本页（1:1 还原网页端 src/app/l/[id]/GeneralView）。
///
/// 复用 [GeneralState] 绑定（条目 + 本月/本周汇总 + 账本设置/分类管理）。
class GeneralLedgerPage extends StatelessWidget {
  final Ledger ledger;
  const GeneralLedgerPage({super.key, required this.ledger});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => GeneralState(ledger)..load(),
      child: const _GeneralLedgerScaffold(),
    );
  }
}

// ---------------------------------------------------------------------------
// 骨架
// ---------------------------------------------------------------------------

class _GeneralLedgerScaffold extends StatelessWidget {
  const _GeneralLedgerScaffold();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<GeneralState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final showBudget =
        state.ledger.budgetCents != null && state.ledger.budgetCents! > 0;
    final showWeek = state.customCategories.budgetsWeekly.isNotEmpty;

    return Scaffold(
      backgroundColor: pageBg,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PageHeader(
                icon: state.ledger.icon ?? '📒',
                title: state.ledger.name,
                subtitle: '普通账本',
                actions: <Widget>[
                  _HeaderAction(
                    icon: Icons.group_outlined,
                    onTap: () => _openCollaborators(context),
                  ),
                  _HeaderAction(
                    icon: Icons.settings_outlined,
                    onTap: () => _openSettings(context),
                  ),
                ],
              ),
              const _SyncCard(),
              const SizedBox(height: 16),
              const _SummaryCard(),
              if (showBudget) ...<Widget>[
                const SizedBox(height: 16),
                const _BudgetCard(),
              ],
              const SizedBox(height: 16),
              const _MonthCategoryCard(),
              if (showWeek) ...<Widget>[
                const SizedBox(height: 16),
                const _WeekCategoryCard(),
              ],
              const SizedBox(height: 16),
              const _AddButton(),
              const SizedBox(height: 16),
              const _EntryList(),
              const SizedBox(height: 8),
              const Center(
                child: Text('已经到底了',
                    style: TextStyle(color: Colors.grey, fontSize: 12)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 头部右侧圆形图标按钮（协作 / 设置）。
class _HeaderAction extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _HeaderAction({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Icon(icon, size: 22, color: ink500),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 离线同步卡
// ---------------------------------------------------------------------------

class _SyncCard extends StatelessWidget {
  const _SyncCard();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<GeneralState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final amberText =
        isDark ? const Color(0xFCD34D) : const Color(0xB45309);
    final amberBg = isDark ? const Color(0x33F59E0B) : const Color(0xFFFEF3C7);
    final amberBorder =
        isDark ? const Color(0x66F59E0B) : const Color(0xFFFDE68A);

    if (state.pendingCount == 0) {
      return Text('✅ 已全部同步',
          style: TextStyle(color: amberText, fontSize: 13));
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: amberBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: amberBorder, width: 1),
      ),
      child: Row(
        children: [
          const Text('📶', style: TextStyle(fontSize: 18)),
          const SizedBox(width: 8),
          Expanded(
            child: Text('有 ${state.pendingCount} 笔待同步',
                style: TextStyle(
                    color: amberText,
                    fontSize: 14,
                    fontWeight: FontWeight.w600)),
          ),
          TextButton(
            onPressed: () => _syncNow(context),
            child: Text('立即同步',
                style: TextStyle(
                    color: amberText, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 汇总卡（本月结余 + 收入/支出）
// ---------------------------------------------------------------------------

class _SummaryCard extends StatelessWidget {
  const _SummaryCard();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<GeneralState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    final month = int.parse(state.currentYearMonth.split('-')[1]);
    final net = state.net;

    return AppCard(
      radius: 24,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('本月 $month 月 · 结余（元）',
                style: TextStyle(color: ink500, fontSize: 13)),
            const SizedBox(height: 8),
            Money(
              cents: net,
              sign: true,
              style: TextStyle(
                color: net < 0 ? red : green,
                fontSize: 34,
                fontWeight: FontWeight.w800,
                height: 1.1,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                    child: _SummaryStat(
                        label: '收入', cents: state.monthIncome, color: green)),
                const SizedBox(width: 12),
                Expanded(
                    child: _SummaryStat(
                        label: '支出', cents: state.monthExpense, color: red)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryStat extends StatelessWidget {
  final String label;
  final int cents;
  final Color color;
  const _SummaryStat(
      {required this.label, required this.cents, required this.color});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: ink500, fontSize: 12)),
        const SizedBox(height: 4),
        Money(
          cents: cents,
          style: TextStyle(
              color: color, fontSize: 18, fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// 月度预算进度卡
// ---------------------------------------------------------------------------

class _BudgetCard extends StatelessWidget {
  const _BudgetCard();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<GeneralState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;
    final amber = const Color(0xFFF59E0B);

    final budget = state.ledger.budgetCents ?? 0;
    if (budget <= 0) return const SizedBox.shrink();

    final expense = state.monthExpense;
    final ratio = expense / budget;
    final over = expense > budget;
    final color = over ? red : (ratio >= 0.8 ? amber : green);
    final widthPct = (ratio * 100).clamp(0, 100).toDouble();

    return AppCard(
      radius: 24,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('月度预算', style: TextStyle(color: ink500, fontSize: 13)),
                const Spacer(),
                Money(
                  cents: expense,
                  style: TextStyle(
                      color: ink900, fontSize: 13, fontWeight: FontWeight.w600),
                ),
                Text(' / ', style: TextStyle(color: ink400, fontSize: 13)),
                Money(
                  cents: budget,
                  style: TextStyle(color: ink400, fontSize: 13),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _Bar(widthPct: widthPct, color: color),
            if (over) ...<Widget>[
              const SizedBox(height: 8),
              Row(
                children: [
                  Text('超支 ', style: TextStyle(color: red, fontSize: 13)),
                  Money(
                    cents: expense - budget,
                    style: TextStyle(
                        color: red, fontSize: 13, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 分类预算行 + 卡（本月 / 本周共用）
// ---------------------------------------------------------------------------

class _MonthCategoryCard extends StatelessWidget {
  const _MonthCategoryCard();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<GeneralState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;

    final spend = state.monthCategorySpend;
    final budgets = state.customCategories.budgets;
    final cats = <String>{...spend.keys, ...budgets.keys}.toList();
    cats.sort((a, b) => (spend[b] ?? 0).compareTo(spend[a] ?? 0));

    return AppCard(
      radius: 24,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('本月类别 · 支出与预算',
                style: TextStyle(
                    color: ink900, fontSize: 15, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            if (cats.isEmpty)
              Text('暂无支出',
                  style: TextStyle(
                      color: isDark
                          ? AppColors.darkInk500
                          : AppColors.lightInk500,
                      fontSize: 13))
            else
              ...cats.map((c) => _CategoryRow(
                    name: c,
                    spent: spend[c] ?? 0,
                    budget: budgets[c],
                    totalExpense: state.monthExpense,
                  )),
          ],
        ),
      ),
    );
  }
}

class _WeekCategoryCard extends StatelessWidget {
  const _WeekCategoryCard();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<GeneralState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;

    final week = state.weekCategorySpend;
    final wb = state.customCategories.budgetsWeekly;
    final cats = wb.keys.toList();
    cats.sort((a, b) => (week[b] ?? 0).compareTo(week[a] ?? 0));

    return AppCard(
      radius: 24,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('本周类别预算',
                style: TextStyle(
                    color: ink900, fontSize: 15, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            ...cats.map((c) => _CategoryRow(
                  name: c,
                  spent: week[c] ?? 0,
                  budget: wb[c],
                  totalExpense: 0,
                )),
          ],
        ),
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  final String name;
  final int spent;
  final int? budget;
  final int totalExpense;
  const _CategoryRow({
    required this.name,
    required this.spent,
    required this.budget,
    required this.totalExpense,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;
    final amber = const Color(0xFFF59E0B);

    final hasBudget = budget != null && budget! > 0;
    final ratio = hasBudget
        ? (spent / budget!).clamp(0, 1)
        : (totalExpense > 0 ? (spent / totalExpense).clamp(0, 1) : 0.0);
    final pct = (ratio * 100).round();
    final over = hasBudget && spent > budget!;
    final color = over ? red : (hasBudget && ratio >= 0.8 ? amber : green);

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(iconOf(name), style: const TextStyle(fontSize: 16)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(name,
                    style: TextStyle(
                        color: ink900, fontSize: 14, fontWeight: FontWeight.w600)),
              ),
              if (hasBudget) ...<Widget>[
                Money(
                  cents: spent,
                  style: TextStyle(
                      color: ink900, fontSize: 13, fontWeight: FontWeight.w700),
                ),
                Text(' / ', style: TextStyle(color: ink400, fontSize: 13)),
                Money(
                  cents: budget!,
                  style: TextStyle(color: ink400, fontSize: 13),
                ),
                const SizedBox(width: 6),
                Text('$pct%', style: TextStyle(color: ink500, fontSize: 12)),
              ] else ...<Widget>[
                Money(
                  cents: spent,
                  style: TextStyle(
                      color: ink900, fontSize: 13, fontWeight: FontWeight.w700),
                ),
                const SizedBox(width: 6),
                Text('$pct%', style: TextStyle(color: ink500, fontSize: 12)),
              ],
            ],
          ),
          if (hasBudget) ...<Widget>[
            const SizedBox(height: 8),
            _Bar(widthPct: ratio * 100, color: color),
            if (over) ...<Widget>[
              const SizedBox(height: 6),
              Row(
                children: [
                  Text('超支 ', style: TextStyle(color: red, fontSize: 12)),
                  Money(
                    cents: spent - budget!,
                    style: TextStyle(
                        color: red, fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ],
          ],
        ],
      ),
    );
  }
}

/// 进度条：宽度按 0–100 占比，颜色由调用方决定（超支红 / 临界黄 / 正常绿）。
class _Bar extends StatelessWidget {
  final double widthPct;
  final Color color;
  final double height;
  const _Bar({required this.widthPct, required this.color, this.height = 8});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final track = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final factor = (widthPct / 100).clamp(0, 1).toDouble();
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: track,
        borderRadius: BorderRadius.circular(height / 2),
      ),
      child: FractionallySizedBox(
        alignment: Alignment.centerLeft,
        widthFactor: factor,
        heightFactor: 1,
        child: Container(
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(height / 2),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 记一笔按钮
// ---------------------------------------------------------------------------

class _AddButton extends StatelessWidget {
  const _AddButton();

  @override
  Widget build(BuildContext context) {
    return AppPrimaryButton(
      label: '+ 记一笔',
      onPressed: () => _openEntryForm(context),
    );
  }
}

// ---------------------------------------------------------------------------
// 记录列表（按天分组）
// ---------------------------------------------------------------------------

class _DayGroup {
  final String key;
  final DateTime date;
  final List<GeneralEntry> entries;
  _DayGroup({required this.key, required this.date, required this.entries});
}

class _EntryList extends StatelessWidget {
  const _EntryList();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<GeneralState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final entries = state.entries;

    if (entries.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.only(top: 24),
          child: Text('还没有记录，点击上方 + 开始',
              style: TextStyle(color: ink500, fontSize: 13)),
        ),
      );
    }

    // 按天分组（条目已按 occurredAt 倒序）。
    final groups = <_DayGroup>[];
    for (final e in entries) {
      final key = DateFormat('yyyy-MM-dd')
          .format(DateTime.fromMillisecondsSinceEpoch(e.occurredAt));
      if (groups.isEmpty || groups.last.key != key) {
        groups.add(_DayGroup(
          key: key,
          date: DateTime.fromMillisecondsSinceEpoch(e.occurredAt),
          entries: <GeneralEntry>[],
        ));
      }
      groups.last.entries.add(e);
    }

    final children = <Widget>[];
    for (final g in groups) {
      int inc = 0;
      int exp = 0;
      for (final e in g.entries) {
        if (e.direction == 'income') {
          inc += e.amountCents;
        } else {
          exp += e.amountCents;
        }
      }
      children.add(_DayHeader(date: g.date, income: inc, expense: exp));
      for (final e in g.entries) {
        children.add(_EntryRowTile(entry: e));
        children.add(const SizedBox(height: 12));
      }
    }
    return Column(children: children);
  }
}

class _DayHeader extends StatelessWidget {
  final DateTime date;
  final int income;
  final int expense;
  const _DayHeader(
      {required this.date, required this.income, required this.expense});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 8),
      child: Row(
        children: [
          Text('${date.month}月${date.day}日 · ${_weekdayName(date.weekday)}',
              style: TextStyle(color: ink500, fontSize: 12)),
          const Spacer(),
          if (income > 0)
            Row(
              children: [
                Text('收 ', style: TextStyle(color: ink500, fontSize: 12)),
                Money(
                  cents: income,
                  style: TextStyle(
                      color: green, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          if (expense > 0)
            Row(
              children: [
                Text(' 支 ', style: TextStyle(color: ink500, fontSize: 12)),
                Money(
                  cents: expense,
                  style: TextStyle(
                      color: red, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _EntryRowTile extends StatelessWidget {
  final GeneralEntry entry;
  const _EntryRowTile({required this.entry});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    final income = entry.direction == 'income';
    final color = income ? green : red;
    final time =
        DateFormat('HH:mm').format(DateTime.fromMillisecondsSinceEpoch(entry.occurredAt));

    return AppCard(
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: () => _openEntryForm(context, entry: entry),
        onLongPress: () => _confirmDelete(context, entry),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('$time · ${entry.category}',
                        style: TextStyle(color: ink500, fontSize: 13)),
                    const SizedBox(height: 4),
                    Text(entry.note ?? '',
                        style: TextStyle(color: ink900, fontSize: 15)),
                  ],
                ),
              ),
              Money(
                cents: entry.amountCents,
                sign: true,
                style: TextStyle(
                    color: color, fontSize: 16, fontWeight: FontWeight.w700),
              ),
              const SizedBox(width: 8),
              InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => _confirmDelete(context, entry),
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(Icons.delete_outline, color: ink400, size: 20),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _weekdayName(int w) {
  const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  return names[(w - 1).clamp(0, 6)];
}

// ---------------------------------------------------------------------------
// 弹窗：记一笔 / 编辑（共用）
// ---------------------------------------------------------------------------

Future<void> _openEntryForm(BuildContext context, {GeneralEntry? entry}) {
  final state = context.read<GeneralState>();
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (_) => ChangeNotifierProvider.value(
      value: state,
      child: _EntryFormSheet(entry: entry),
    ),
  );
}

class _EntryFormSheet extends StatefulWidget {
  final GeneralEntry? entry;
  const _EntryFormSheet({this.entry});

  @override
  State<_EntryFormSheet> createState() => _EntryFormSheetState();
}

class _EntryFormSheetState extends State<_EntryFormSheet> {
  late String _direction;
  final _category = TextEditingController();
  final _amount = TextEditingController();
  final _note = TextEditingController();
  final _image = TextEditingController();
  late DateTime _date;

  @override
  void initState() {
    super.initState();
    final e = widget.entry;
    _direction = e?.direction ?? 'expense';
    _category.text = e?.category ?? '餐饮';
    _amount.text = e != null ? money.Money.formatPlain(e.amountCents) : '';
    _note.text = e?.note ?? '';
    _image.text = e != null && e.imageUrls.isNotEmpty ? e.imageUrls.first : '';
    _date = e != null
        ? DateTime.fromMillisecondsSinceEpoch(e.occurredAt)
        : DateTime.now();
  }

  @override
  void dispose() {
    _category.dispose();
    _amount.dispose();
    _note.dispose();
    _image.dispose();
    super.dispose();
  }

  List<String> _suggestions(GeneralState state) {
    final recent = <String>[];
    for (final en in state.entries) {
      if (!recent.contains(en.category)) recent.add(en.category);
    }
    final added = state.customCategories.added.map((x) => x.toString());
    return <String>{...recent, ...defaultCategories, ...added}.toList();
  }

  Future<void> _save() async {
    final state = context.read<GeneralState>();
    final cents = money.Money.parseToCents(_amount.text);
    if (cents == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('金额格式不正确')));
      return;
    }
    final category =
        _category.text.trim().isEmpty ? '其他' : _category.text.trim();
    final note = _note.text.trim().isEmpty ? null : _note.text.trim();
    final imageUrls =
        _image.text.trim().isEmpty ? const <String>[] : <String>[_image.text.trim()];
    final occurredAt = _date.millisecondsSinceEpoch;

    final e = widget.entry;
    if (e == null) {
      await state.addEntry(
        direction: _direction,
        category: category,
        amountCents: cents,
        note: note,
        occurredAt: occurredAt,
        imageUrls: imageUrls,
      );
    } else {
      await state.saveEntry(GeneralEntry(
        id: e.id,
        ledgerId: e.ledgerId,
        serverId: e.serverId,
        direction: _direction,
        category: category,
        amountCents: cents,
        tags: e.tags,
        note: note,
        imageUrls: imageUrls,
        occurredAt: occurredAt,
        deletedAt: e.deletedAt,
        synced: 0,
        clientId: e.clientId,
      ));
    }
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() => _date = DateTime(
          picked.year, picked.month, picked.day, _date.hour, _date.minute));
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<GeneralState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;

    final suggestions = _suggestions(state);

    return _sheetScaffold(
      context,
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.entry == null ? '记一笔' : '编辑记录',
              style: TextStyle(
                  color: ink900, fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'expense', label: Text('支出')),
              ButtonSegment(value: 'income', label: Text('收入')),
            ],
            selected: {_direction},
            onSelectionChanged: (s) => setState(() => _direction = s.first),
          ),
          const SizedBox(height: 12),
          AppTextField(controller: _category, hint: '类别'),
          const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: suggestions
                        .map((c) => ActionChip(
                              label: Text(c,
                                  style: TextStyle(color: ink900, fontSize: 13)),
                              backgroundColor: isDark
                                  ? AppColors.darkSurface
                                  : AppColors.lightSurfaceSubtle,
                              shape: StadiumBorder(
                                side: BorderSide(
                                  color: isDark
                                      ? AppColors.darkBorder
                                      : AppColors.lightBorder,
                                ),
                              ),
                              onPressed: () {
                                _category.text = c;
                                setState(() {});
                              },
                            ))
                        .toList(),
                  ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () async {
                await _openCategories(context);
                setState(() {});
              },
              child: const Text('管理分类'),
            ),
          ),
          const SizedBox(height: 8),
          AppTextField(controller: _amount, hint: '金额（元）'),
          const SizedBox(height: 12),
          AppTextField(controller: _note, hint: '备注'),
          const SizedBox(height: 12),
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: _pickDate,
            child: InputDecorator(
              decoration: InputDecoration(
                filled: true,
                fillColor: isDark
                    ? AppColors.darkSurface
                    : AppColors.lightSurface,
                contentPadding: const EdgeInsets.all(16),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(
                    color: isDark
                        ? AppColors.darkBorder
                        : AppColors.lightBorder,
                  ),
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.calendar_today_outlined,
                      size: 18, color: ink500),
                  const SizedBox(width: 8),
                  Text('${_date.year}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}',
                      style: TextStyle(color: ink900, fontSize: 15)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          AppTextField(controller: _image, hint: '图片链接（可选）'),
          const SizedBox(height: 16),
          AppPrimaryButton(label: '保存', onPressed: _save),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 弹窗：账本设置
// ---------------------------------------------------------------------------

Future<void> _openSettings(BuildContext context) {
  final state = context.read<GeneralState>();
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (_) => ChangeNotifierProvider.value(
      value: state,
      child: const _SettingsSheet(),
    ),
  );
}

class _SettingsSheet extends StatefulWidget {
  const _SettingsSheet();

  @override
  State<_SettingsSheet> createState() => _SettingsSheetState();
}

class _SettingsSheetState extends State<_SettingsSheet> {
  final _name = TextEditingController();
  final _budget = TextEditingController();
  final _currency = TextEditingController();

  @override
  void initState() {
    super.initState();
    final ledger = context.read<GeneralState>().ledger;
    _name.text = ledger.name;
    _budget.text = ledger.budgetCents != null
        ? money.Money.formatPlain(ledger.budgetCents!)
        : '';
    _currency.text = ledger.baseCurrency ?? 'CNY';
  }

  @override
  void dispose() {
    _name.dispose();
    _budget.dispose();
    _currency.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final state = context.read<GeneralState>();
    final budgetCents = money.Money.parseToCents(_budget.text) ?? 0;
    final updated = state.ledger.copyWith(
      name: _name.text.trim().isEmpty ? state.ledger.name : _name.text.trim(),
      budgetCents: budgetCents > 0 ? budgetCents : null,
      baseCurrency: _currency.text.trim().isEmpty ? null : _currency.text.trim(),
    );
    await state.updateLedger(updated);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;

    return _sheetScaffold(
      context,
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('账本设置',
              style: TextStyle(
                  color: ink900, fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          AppTextField(controller: _name, hint: '账本名称'),
          const SizedBox(height: 12),
          AppTextField(controller: _budget, hint: '月度预算（元，0 表示不限制）'),
          const SizedBox(height: 12),
          AppTextField(controller: _currency, hint: '币种（如 CNY）'),
          const SizedBox(height: 16),
          AppPrimaryButton(label: '保存', onPressed: _save),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 弹窗：分类管理（添加 / 删除 / 设预算）
// ---------------------------------------------------------------------------

Future<void> _openCategories(BuildContext context) {
  final state = context.read<GeneralState>();
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (_) => ChangeNotifierProvider.value(
      value: state,
      child: const _CategoryManagerSheet(),
    ),
  );
}

class _CategoryManagerSheet extends StatefulWidget {
  const _CategoryManagerSheet();

  @override
  State<_CategoryManagerSheet> createState() => _CategoryManagerSheetState();
}

class _CategoryManagerSheetState extends State<_CategoryManagerSheet> {
  late List<String> _added;
  late Map<String, int> _budgets;
  late List<String> _all;
  final _newCat = TextEditingController();
  final Map<String, TextEditingController> _budgetCtl = {};

  TextEditingController _ctl(String c) => _budgetCtl.putIfAbsent(
        c,
        () => TextEditingController(
          text: _budgets.containsKey(c) ? money.Money.formatPlain(_budgets[c]!) : '',
        ),
      );

  @override
  void initState() {
    super.initState();
    final cc = context.read<GeneralState>().customCategories;
    _added = List<String>.from(cc.added.map((x) => x.toString()));
    _budgets = Map<String, int>.from(cc.budgets);
    _rebuildAll();
  }

  void _rebuildAll() {
    _all = <String>{...defaultCategories, ..._added}.toList();
  }

  @override
  void dispose() {
    _newCat.dispose();
    for (final c in _budgetCtl.values) c.dispose();
    super.dispose();
  }

  void _addCategory() {
    final v = _newCat.text.trim();
    if (v.isEmpty || _all.contains(v)) {
      _newCat.clear();
      return;
    }
    setState(() {
      _added.add(v);
      _rebuildAll();
      _newCat.clear();
    });
  }

  void _removeCategory(String c) {
    setState(() {
      _added.remove(c);
      _budgets.remove(c);
      final ctl = _budgetCtl.remove(c);
      ctl?.dispose();
      _rebuildAll();
    });
  }

  Future<void> _save() async {
    final state = context.read<GeneralState>();
    final cc = CustomCategories(added: _added, budgets: _budgets);
    final updated =
        state.ledger.copyWith(customCategories: jsonEncode(cc.toJson()));
    await state.updateLedger(updated);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    return _sheetScaffold(
      context,
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('分类管理',
              style: TextStyle(
                  color: ink900, fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          ..._all.map((c) {
            final isCustom = _added.contains(c);
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Text(iconOf(c), style: const TextStyle(fontSize: 18)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(c,
                        style: TextStyle(
                            color: ink900, fontSize: 14, fontWeight: FontWeight.w600)),
                  ),
                  SizedBox(
                    width: 96,
                    child: TextField(
                      controller: _ctl(c),
                      onChanged: (v) {
                        final cents = money.Money.parseToCents(v);
                        setState(() {
                          if (cents != null && cents > 0) {
                            _budgets[c] = cents;
                          } else {
                            _budgets.remove(c);
                          }
                        });
                      },
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration: InputDecoration(
                        hintText: '预算',
                        hintStyle: TextStyle(color: ink400, fontSize: 12),
                        isCollapsed: true,
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 8),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(
                            color: isDark
                                ? AppColors.darkBorder
                                : AppColors.lightBorder,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  if (isCustom)
                    InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () => _removeCategory(c),
                      child: Padding(
                        padding: const EdgeInsets.all(4),
                        child: Icon(Icons.close, color: red, size: 18),
                      ),
                    )
                  else
                    SizedBox(
                      width: 26,
                      child: Text('', style: TextStyle(color: ink500)),
                    ),
                ],
              ),
            );
          }),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: AppTextField(controller: _newCat, hint: '新增分类名')),
              const SizedBox(width: 8),
              TextButton(onPressed: _addCategory, child: const Text('添加')),
            ],
          ),
          const SizedBox(height: 16),
          AppPrimaryButton(label: '完成', onPressed: _save),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 协作（占位）& 删除确认
// ---------------------------------------------------------------------------

Future<void> _openCollaborators(BuildContext context) async {
  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('协作'),
      content: const Text('协作功能即将上线（当前为本地优先版本）。'),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('好的'),
        ),
      ],
    ),
  );
}

Future<void> _confirmDelete(BuildContext context, GeneralEntry e) async {
  final state = context.read<GeneralState>();
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('删除这笔记录？'),
      content: Text(
        '确定要删除「${e.category} · ${money.Money.formatPlain(e.amountCents)} 元」吗？此操作不可撤销。',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('取消'),
        ),
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: const Text('删除', style: TextStyle(color: Colors.red)),
        ),
      ],
    ),
  );
  if (ok == true) {
    await state.deleteEntry(e);
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('已删除')));
    }
  }
}

Future<void> _syncNow(BuildContext context) async {
  final state = context.read<GeneralState>();
  try {
    await state.syncNow();
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('同步完成')));
    }
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('同步失败，请稍后重试')),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 通用底部弹窗外壳
// ---------------------------------------------------------------------------

Widget _sheetScaffold(BuildContext context, Widget child) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
  return Container(
    constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.92),
    decoration: BoxDecoration(
      color: surface,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
    ),
    padding: EdgeInsets.only(
      left: 20,
      right: 20,
      top: 20,
      bottom: MediaQuery.of(context).viewInsets.bottom + 20,
    ),
    child: SingleChildScrollView(child: child),
  );
}
