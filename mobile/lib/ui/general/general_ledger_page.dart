import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/money.dart';
import '../../data/models/general_entry.dart';
import '../../data/models/ledger.dart';
import '../../state/general_state.dart';

class GeneralLedgerPage extends StatelessWidget {
  final Ledger ledger;
  const GeneralLedgerPage({super.key, required this.ledger});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => GeneralState(ledger)..load(),
      child: Scaffold(
        appBar: AppBar(title: Text(ledger.name)),
        body: const _EntryList(),
        floatingActionButton: FloatingActionButton(
          child: const Icon(Icons.add),
          onPressed: () => showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            builder: (_) => const AddGeneralSheet(),
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
    final state = context.watch<GeneralState>();
    if (state.entries.isEmpty) {
      return const Center(child: Text('还没有记录，点右下角记一笔'));
    }
    return ListView.separated(
      itemCount: state.entries.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (_, i) {
        final e = state.entries[i];
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
            return false; // 已由本地删除驱动刷新
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
      },
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
