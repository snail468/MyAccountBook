import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/money.dart';
import '../../data/models/ledger.dart';
import '../../data/models/work_entry.dart';
import '../../state/work_state.dart';
import '../../theme/app_theme.dart';
import '../../theme/design_tokens.dart';
import '../home_page.dart';
import '../settings_page.dart';
import '../widgets/app_card.dart';
import '../widgets/app_floating_button.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/money_text.dart';
import '../widgets/section_label.dart';

/// 工作账本页（设计 2:128 重做）：对齐 general_ledger_page 的"无 AppBar + 自定义头部 + 悬浮钮"模式。
/// 眼睛钮占位：未上线功能提示。定义为文件级函数，供内部 _Body 等类调用。
void _comingSoon(BuildContext context) {
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(content: Text('第二阶段上线')),
  );
}

class WorkLedgerPage extends StatelessWidget {
  final Ledger ledger;
  const WorkLedgerPage({super.key, required this.ledger});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => WorkState(ledger)..load(),
      child: Scaffold(
        backgroundColor: AppTheme.scaffoldBackground(context),
        body: const _Body(),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<WorkState>();
    final ledger = state.ledger;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;

    // 汇总
    int income = 0;
    int expense = 0;
    for (final e in state.entries) {
      if (e.direction == 'income') {
        income += e.amountCents;
      } else {
        expense += e.amountCents;
      }
    }
    final pending = expense - income; // 待回款（净垫款）
    final pendingCents = pending > 0 ? pending : 0;

    // 当月进项（元信息）
    final now = DateTime.now();
    final ym = '${now.year}-${now.month.toString().padLeft(2, '0')}';
    final curMonthIncome = state.entries
        .where((e) => e.yearMonth == ym && e.direction == 'income')
        .fold(0, (s, e) => s + e.amountCents);
    final meta = state.entries.isEmpty
        ? '$ym · 暂无记账'
        : '$ym · 进项 ${Money.formatCents(curMonthIncome)}';

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 48, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ---- 头部 + 悬浮钮 ----
          Row(
            children: [
              Text('💼', style: const TextStyle(fontSize: 24)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(ledger.name,
                        style: TextStyle(
                            color: ink900, fontSize: 18, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(meta, style: TextStyle(color: ink500, fontSize: 13)),
                  ],
                ),
              ),
              AppFloatingButton(
                icon: const Text('🏠', style: TextStyle(fontSize: 20)),
                onPressed: () => Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const HomePage()),
                  (route) => false,
                ),
              ),
              const SizedBox(width: 10),
              AppFloatingButton(
                icon: const Text('👁', style: TextStyle(fontSize: 20)),
                onPressed: () => _comingSoon(context),
              ),
              const SizedBox(width: 10),
              AppFloatingButton(
                icon: const Text('⚙️', style: TextStyle(fontSize: 20)),
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const SettingsPage()),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // ---- 汇总卡 ----
          Row(
            children: [
              Expanded(
                  child: _SummaryTile(title: '进项', cents: income, color: ink900)),
              const SizedBox(width: 12),
              Expanded(
                  child: _SummaryTile(title: '出项', cents: expense, color: ink900)),
              const SizedBox(width: 12),
              Expanded(
                  child: _SummaryTile(
                      title: '待回款', cents: pendingCents, color: ink900)),
            ],
          ),
          const SizedBox(height: 16),

          // ---- 记一笔 ----
          AppPrimaryButton(
            label: '记一笔',
            onPressed: () => showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              builder: (_) => ChangeNotifierProvider.value(
                value: state,
                child: const AddWorkSheet(),
              ),
            ),
          ),
          const SizedBox(height: 8),
          SectionLabel('按月查看'),

          // ---- 月卡 ----
          _MonthList(),
        ],
      ),
    );
  }
}

class _SummaryTile extends StatelessWidget {
  final String title;
  final int cents;
  final Color color;
  const _SummaryTile({
    required this.title,
    required this.cents,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return AppCard(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 6),
            MoneyText(cents, fontSize: 17, fontWeight: FontWeight.w700, color: color),
          ],
        ),
      ),
    );
  }
}

/// 按月分组卡片列表。
class _MonthList extends StatelessWidget {
  const _MonthList();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<WorkState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;

    // 仅未删除
    final active = state.entries.where((e) => e.deletedAt == null).toList();
    final byMonth = <String, List<WorkEntry>>{};
    for (final e in active) {
      byMonth.putIfAbsent(e.yearMonth, () => []).add(e);
    }
    final months = byMonth.keys.toList()..sort((a, b) => b.compareTo(a));

    if (months.isEmpty) {
      return Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Text('还没有按月记录', style: TextStyle(color: ink500, fontSize: 13)),
      );
    }

    return Column(
      children: months.map((ym) {
        final list = byMonth[ym]!;
        int inc = 0;
        int exp = 0;
        for (final e in list) {
          if (e.direction == 'income') {
            inc += e.amountCents;
          } else {
            exp += e.amountCents;
          }
        }
        final reimbursedPct = (inc + exp) > 0
            ? (inc / (inc + exp) * 100).round()
            : 0;
        final parts = ym.split('-');
        final title = '${parts[0]}年${int.parse(parts[1])}月';
        final subtitle =
            '进项 ${Money.formatCents(inc)} / 出项 ${Money.formatCents(exp)} / 已回款 $reimbursedPct%';

        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: AppCard(
            onTap: () => showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              builder: (_) => ChangeNotifierProvider.value(
                value: state,
                child: _MonthSheet(monthLabel: title, entries: list),
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title,
                            style: TextStyle(
                                color: ink900,
                                fontSize: 16,
                                fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        Text(subtitle,
                            style: TextStyle(color: ink500, fontSize: 13)),
                      ],
                    ),
                  ),
                  Text('›', style: TextStyle(color: ink400, fontSize: 20)),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

/// 某月明细底部弹层（复用 _EntryTile 的 Dismissible 删除）。
class _MonthSheet extends StatelessWidget {
  final String monthLabel;
  final List<WorkEntry> entries;
  const _MonthSheet({required this.monthLabel, required this.entries});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    return Container(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        top: 16,
        left: 16,
        right: 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(monthLabel,
              style: TextStyle(color: ink900, fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          ...entries.map((e) => _EntryTile(e: e)),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _EntryTile extends StatelessWidget {
  final WorkEntry e;
  const _EntryTile({required this.e});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<WorkState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final income = e.direction == 'income';
    return Dismissible(
      key: Key(e.id),
      direction: DismissDirection.endToStart,
      background: const ColoredBox(
        color: Colors.red,
        child: Align(
          alignment: Alignment.centerRight,
          child: Padding(
            padding: EdgeInsets.only(right: 16),
            child: Icon(Icons.delete, color: Colors.white),
          ),
        ),
      ),
      confirmDismiss: (_) async {
        await state.deleteEntry(e);
        return false;
      },
      child: ListTile(
        title: Text(e.category, style: TextStyle(color: ink900)),
        subtitle: e.note != null && e.note!.isNotEmpty
            ? Text(e.note!, style: TextStyle(color: ink500))
            : null,
        trailing: Text(
          '${income ? '+' : '-'}${Money.formatCents(e.amountCents)}',
          style: TextStyle(
            color: income ? AppColors.lightSemanticRed : ink900,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }
}

class AddWorkSheet extends StatefulWidget {
  const AddWorkSheet({super.key});

  @override
  State<AddWorkSheet> createState() => _AddWorkSheetState();
}

class _AddWorkSheetState extends State<AddWorkSheet> {
  String _direction = 'expense';
  final _category = TextEditingController(text: '垫款');
  final _amount = TextEditingController();
  final _note = TextEditingController();

  Future<void> _save() async {
    final cents = Money.parseToCents(_amount.text);
    if (cents == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('金额格式不正确')),
      );
      return;
    }
    final state = context.read<WorkState>();
    await state.addEntry(
      direction: _direction,
      category: _category.text.trim().isEmpty ? '其他' : _category.text.trim(),
      amountCents: cents,
      note: _note.text.trim().isEmpty ? null : _note.text.trim(),
      occurredAt: DateTime.now().millisecondsSinceEpoch,
    );
    if (mounted) Navigator.of(context).pop();
  }

  @override
  void dispose() {
    _category.dispose();
    _amount.dispose();
    _note.dispose();
    super.dispose();
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
        children: [
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'expense', label: Text('支出/垫款')),
              ButtonSegment(value: 'income', label: Text('收入/回款')),
            ],
            selected: {_direction},
            onSelectionChanged: (s) => setState(() => _direction = s.first),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _category,
            decoration: const InputDecoration(labelText: '类别', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _amount,
            decoration: const InputDecoration(
                labelText: '金额', prefixText: '¥', border: OutlineInputBorder()),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _note,
            decoration: const InputDecoration(labelText: '备注', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _save, child: const Text('保存')),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
