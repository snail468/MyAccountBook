import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/money.dart';
import '../../data/models/ledger.dart';
import '../../data/models/work_entry.dart';
import '../../state/work_state.dart';

class WorkLedgerPage extends StatelessWidget {
  final Ledger ledger;
  const WorkLedgerPage({super.key, required this.ledger});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => WorkState(ledger)..load(),
      child: Scaffold(
        appBar: AppBar(title: Text(ledger.name)),
        body: const _EntryList(),
        floatingActionButton: FloatingActionButton(
          child: const Icon(Icons.add),
          onPressed: () => showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            builder: (_) => const AddWorkSheet(),
          ),
        ),
      ),
    );
  }
}

class _EntryList extends StatelessWidget {
  const _EntryList();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<WorkState>();
    if (state.entries.isEmpty) {
      return const Center(child: Text('还没有记录，点右下角记一笔'));
    }
    // 按月份分组
    final byMonth = <String, List<WorkEntry>>{};
    for (final e in state.entries) {
      byMonth.putIfAbsent(e.yearMonth, () => []).add(e);
    }
    final months = byMonth.keys.toList()..sort((a, b) => b.compareTo(a));

    return ListView(
      children: [
        for (final ym in months) ...[
          _MonthHeader(ym: ym, entries: byMonth[ym]!),
          ...byMonth[ym]!.map((e) => _EntryTile(e: e)),
        ],
      ],
    );
  }
}

class _MonthHeader extends StatelessWidget {
  final String ym;
  final List<WorkEntry> entries;
  const _MonthHeader({required this.ym, required this.entries});

  @override
  Widget build(BuildContext context) {
    int income = 0, expense = 0;
    for (final e in entries) {
      if (e.direction == 'income') {
        income += e.amountCents;
      } else {
        expense += e.amountCents;
      }
    }
    return Container(
      color: Theme.of(context).colorScheme.surfaceVariant,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(ym, style: const TextStyle(fontWeight: FontWeight.bold)),
          Text('收 ${Money.formatCents(income)}  支 ${Money.formatCents(expense)}'),
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
        title: Text(e.category),
        subtitle: e.note != null && e.note!.isNotEmpty ? Text(e.note!) : null,
        trailing: Text(
          '${income ? '+' : '-'}${Money.formatCents(e.amountCents)}',
          style: TextStyle(
            color: income ? Colors.red : Colors.green,
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
