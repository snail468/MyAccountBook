import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/exceptions.dart';
import '../../core/money.dart';
import '../../data/models/ledger.dart';
import '../../data/models/trip.dart';
import '../../state/travel_state.dart';

class TravelPage extends StatelessWidget {
  final Ledger ledger;
  const TravelPage({super.key, required this.ledger});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => TravelState(ledger)..load(),
      child: Scaffold(
        appBar: AppBar(
          title: Text(ledger.name),
          actions: [
            IconButton(
              icon: const Icon(Icons.people),
              tooltip: '成员管理',
              onPressed: () => showDialog(
                context: context,
                builder: (_) => const MembersDialog(),
              ),
            ),
          ],
        ),
        body: const _Body(),
        floatingActionButton: FloatingActionButton(
          child: const Icon(Icons.add),
          onPressed: () => showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            builder: (_) => const AddExpenseSheet(),
          ),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TravelState>();
    return ListView(
      children: [
        const _SettlementCard(),
        if (state.expenses.isEmpty)
          const Padding(
            padding: EdgeInsets.all(32),
            child: Center(child: Text('还没有花费，点右下角记一笔')),
          ),
        ...state.expenses.map((e) => _ExpenseTile(e: e)),
      ],
    );
  }
}

class _ExpenseTile extends StatelessWidget {
  final TripExpense e;
  const _ExpenseTile({required this.e});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TravelState>();
    final payer = state.members.where((m) => m.id == e.payerId).firstOrNull;
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
        await state.deleteExpense(e);
        return false;
      },
      child: ListTile(
        title: Text(e.title),
        subtitle: Text('${e.category} · ${payer?.displayName ?? '?'} · ${e.phase == 'pre' ? '行前' : '途中'}'),
        trailing: Text('${Money.formatCents(e.amountBaseCents)} ${e.currency}'),
      ),
    );
  }
}

class _SettlementCard extends StatelessWidget {
  const _SettlementCard();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TravelState>();
    final transfers = state.settlement();
    final nameOf = (id) => state.members.where((m) => m.id == id).firstOrNull?.displayName ?? id;
    return Card(
      margin: const EdgeInsets.all(12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('AA 结算', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            if (transfers.isEmpty)
              const Text('暂无需要结算的转账 🎉')
            else
              ...transfers.map((t) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Text('${nameOf(t.fromId)} → ${nameOf(t.toId)}  '
                        '${Money.formatCents(t.amountCents)}'),
                  )),
          ],
        ),
      ),
    );
  }
}

class MembersDialog extends StatefulWidget {
  const MembersDialog({super.key});

  @override
  State<MembersDialog> createState() => _MembersDialogState();
}

class _MembersDialogState extends State<MembersDialog> {
  final _name = TextEditingController();

  Future<void> _add() async {
    final v = _name.text.trim();
    if (v.isEmpty) return;
    try {
      final state = context.read<TravelState>();
      // 先按用户名邀请，失败则作为纯名字占位
      await state.addMember(username: v);
    } on ApiException {
      try {
        await context.read<TravelState>().addMember(displayName: v);
      } catch (e) {
        if (mounted) _showErr(e);
      }
    } catch (e) {
      if (mounted) _showErr(e);
    }
    _name.clear();
  }

  void _showErr(Object e) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(e is Exception ? e.toString() : '添加失败（需联网）')),
    );
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TravelState>();
    return AlertDialog(
      title: const Text('成员管理'),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ...state.members.map((m) => ListTile(
                  title: Text(m.displayName),
                  leading: Checkbox(
                    value: m.settled,
                    onChanged: (v) async {
                      try {
                        await state.setSettled(m, v ?? false);
                      } catch (e) {
                        if (mounted) _showErr(e);
                      }
                    },
                  ),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () async {
                      try {
                        await state.deleteMember(m);
                      } catch (e) {
                        if (mounted) _showErr(e);
                      }
                    },
                  ),
                )),
            const Divider(),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _name,
                    decoration: const InputDecoration(
                      labelText: '用户名或名字', border: OutlineInputBorder()),
                  ),
                ),
                IconButton(icon: const Icon(Icons.person_add), onPressed: _add),
              ],
            ),
            const Text('填用户名邀请已注册用户；纯名字则作为占位成员', style: TextStyle(fontSize: 12)),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('关闭')),
      ],
    );
  }
}

class AddExpenseSheet extends StatefulWidget {
  const AddExpenseSheet({super.key});

  @override
  State<AddExpenseSheet> createState() => _AddExpenseSheetState();
}

class _AddExpenseSheetState extends State<AddExpenseSheet> {
  String? _payerId;
  final _title = TextEditingController();
  final _category = TextEditingController(text: '住宿');
  String _phase = 'during';
  final _currency = TextEditingController(text: 'CNY');
  final _foreign = TextEditingController();
  final _rate = TextEditingController(text: '1');
  final Set<String> _participants = {};

  @override
  void initState() {
    super.initState();
    final members = context.read<TravelState>().members;
    if (members.isNotEmpty) {
      _payerId = members.first.id;
      _participants.addAll(members.map((m) => m.id));
    }
  }

  Future<void> _save() async {
    final foreign = Money.parseToCents(_foreign.text);
    final rate = double.tryParse(_rate.text) ?? 0;
    if (foreign == null || rate <= 0 || _payerId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('请填完整且正确的花费信息')));
      return;
    }
    try {
      await context.read<TravelState>().addExpense(
        payerLocalId: _payerId!,
        title: _title.text.trim().isEmpty ? '花费' : _title.text.trim(),
        category: _category.text.trim().isEmpty ? '其他' : _category.text.trim(),
        phase: _phase,
        currency: _currency.text.trim().toUpperCase(),
        amountForeignCents: foreign,
        rate: rate,
        participantLocalIds: _participants.toList(),
      );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e is Exception ? e.toString() : '记账失败')),
        );
      }
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _category.dispose();
    _currency.dispose();
    _foreign.dispose();
    _rate.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TravelState>();
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
          DropdownButtonFormField<String>(
            value: _payerId,
            decoration: const InputDecoration(labelText: '付款人', border: OutlineInputBorder()),
            items: state.members
                .map((m) => DropdownMenuItem(value: m.id, child: Text(m.displayName)))
                .toList(),
            onChanged: (v) => setState(() => _payerId = v),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _title,
            decoration: const InputDecoration(labelText: '项目', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _category,
            decoration: const InputDecoration(labelText: '类别', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'during', label: Text('途中')),
              ButtonSegment(value: 'pre', label: Text('行前')),
            ],
            selected: {_phase},
            onSelectionChanged: (s) => setState(() => _phase = s.first),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _currency,
                  decoration: const InputDecoration(labelText: '币种', border: OutlineInputBorder()),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: TextField(
                  controller: _foreign,
                  decoration: const InputDecoration(labelText: '原币金额', border: OutlineInputBorder()),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _rate,
            decoration: const InputDecoration(
              labelText: '汇率（1 外币 = ? 本币）', border: OutlineInputBorder()),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          const SizedBox(height: 8),
          const Align(alignment: Alignment.centerLeft, child: Text('参与分摊：')),
          ...state.members.map((m) => CheckboxListTile(
                value: _participants.contains(m.id),
                onChanged: (v) => setState(() {
                  if (v == true) {
                    _participants.add(m.id);
                  } else {
                    _participants.remove(m.id);
                  }
                }),
                title: Text(m.displayName),
                controlAffinity: ListTileControlAffinity.leading,
                dense: true,
              )),
          const SizedBox(height: 8),
          FilledButton(onPressed: _save, child: const Text('保存')),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
