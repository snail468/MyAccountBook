import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/money.dart';
import '../../data/models/general_entry.dart';
import '../../data/models/ledger.dart';
import '../../state/general_state.dart';
import '../../state/ledger_list_state.dart';
import '../../theme/app_theme.dart';
import '../../theme/design_tokens.dart';
import '../home_page.dart';
import '../settings_page.dart';
import '../widgets/app_card.dart';
import '../widgets/app_floating_button.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/money_text.dart';

/// 普通账本页（设计 2:87 重做）。
///
/// 复用 [GeneralState] 绑定；右上悬浮钮（回家 / 设置）。
class GeneralLedgerPage extends StatelessWidget {
  final Ledger ledger;
  const GeneralLedgerPage({super.key, required this.ledger});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => GeneralState(ledger)..load(),
      child: Scaffold(
        backgroundColor: AppTheme.scaffoldBackground(context),
        body: const _Body(),
        floatingActionButton: const _AddButton(),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body();

  @override
  Widget build(BuildContext context) {
    final ledger = context.watch<GeneralState>().ledger;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 48, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ---- 头部 + 悬浮钮 ----
          Row(
            children: [
              Text('📒', style: const TextStyle(fontSize: 24)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(ledger.name,
                        style: TextStyle(
                            color: ink900,
                            fontSize: 20,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text('本月 · 3 人共享',
                        style: TextStyle(color: ink500, fontSize: 13)),
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
                icon: const Text('⚙️', style: TextStyle(fontSize: 20)),
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const SettingsPage()),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // ---- 本月收入 / 支出 / 结余 ----
          const _SummaryCards(),
          const SizedBox(height: 16),

          // ---- 待同步 ----
          const _SyncHint(),
          const SizedBox(height: 12),

          // ---- 记录列表 ----
          const _EntryList(),
        ],
      ),
    );
  }
}

/// 三个月度汇总卡。
class _SummaryCards extends StatelessWidget {
  const _SummaryCards();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<GeneralState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    int income = 0;
    int expense = 0;
    for (final e in state.entries) {
      if (e.direction == 'income') {
        income += e.amountCents;
      } else {
        expense += e.amountCents;
      }
    }
    // 无记录时用演示值（设计稿）
    final empty = state.entries.isEmpty;
    final inc = empty ? 510000 : income;
    final exp = empty ? 234000 : expense;
    final bal = empty ? 276000 : (income - expense);

    return Row(
      children: [
        Expanded(
          child: _SummaryTile(title: '本月收入', cents: inc, color: ink900),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _SummaryTile(title: '本月支出', cents: exp, color: ink900),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _SummaryTile(title: '结余', cents: bal, color: ink900),
        ),
      ],
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
            MoneyText(cents,
                fontSize: 17, fontWeight: FontWeight.w700, color: color),
          ],
        ),
      ),
    );
  }
}

/// 待同步提示（点击触发同步）。
class _SyncHint extends StatelessWidget {
  const _SyncHint();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<GeneralState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    final pending =
        state.entries.where((e) => e.synced == 0).length;
    final label = pending == 0 ? '已全部同步' : '待同步 $pending 条 · 点击推送';

    return GestureDetector(
      onTap: () async {
        try {
          await context.read<LedgerListState>().forceSync();
        } catch (_) {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('同步失败，请稍后重试')),
            );
          }
        }
      },
      child: Text(label, style: TextStyle(color: ink500, fontSize: 13)),
    );
  }
}

/// 记录列表（每条 AppCard）。
class _EntryList extends StatelessWidget {
  const _EntryList();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<GeneralState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final red = AppColors.lightSemanticRed;

    if (state.entries.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.only(top: 24),
          child: Text('还没有记录，点右下角记一笔',
              style: TextStyle(color: ink500, fontSize: 13)),
        ),
      );
    }
    return Column(
      children: state.entries.map((e) {
        final income = e.direction == 'income';
        final date = DateFormat('MM-dd').format(
          DateTime.fromMillisecondsSinceEpoch(e.occurredAt),
        );
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: AppCard(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('$date · ${e.category}',
                            style: TextStyle(color: ink500, fontSize: 13)),
                        const SizedBox(height: 4),
                        Text(e.note ?? '',
                            style: TextStyle(color: ink900, fontSize: 15)),
                      ],
                    ),
                  ),
                  MoneyText(
                    e.amountCents,
                    color: income ? ink900 : red,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

/// 右下角「＋ 记一笔」按钮（保留现有新增记录逻辑）。
class _AddButton extends StatelessWidget {
  const _AddButton();

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? AppColors.darkCtaFill : AppColors.lightInk900;
    final fg = isDark ? AppColors.darkCtaText : Colors.white;
    return FloatingActionButton(
      backgroundColor: bg,
      foregroundColor: fg,
      child: const Icon(Icons.add),
      onPressed: () => showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        builder: (_) => ChangeNotifierProvider.value(
          value: context.read<GeneralState>(),
          child: const AddGeneralSheet(),
        ),
      ),
    );
  }
}

class AddGeneralSheet extends StatefulWidget {
  const AddGeneralSheet({super.key});

  @override
  State<AddGeneralSheet> createState() => _AddGeneralSheetState();
}

class _AddGeneralSheetState extends State<AddGeneralSheet> {
  String _direction = 'expense';
  final _category = TextEditingController(text: '餐饮');
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
    final state = context.read<GeneralState>();
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
              ButtonSegment(value: 'expense', label: Text('支出')),
              ButtonSegment(value: 'income', label: Text('收入')),
            ],
            selected: {_direction},
            onSelectionChanged: (s) => setState(() => _direction = s.first),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _category,
            decoration: const InputDecoration(
                labelText: '类别', border: OutlineInputBorder()),
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
            decoration: const InputDecoration(
                labelText: '备注', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 16),
          AppPrimaryButton(label: '保存', onPressed: _save),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
