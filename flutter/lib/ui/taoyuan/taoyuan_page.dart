import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/money.dart';
import '../../data/models/ledger.dart';
import '../../data/models/taoyuan_event.dart';
import '../../state/taoyuan_state.dart';

class TaoyuanPage extends StatelessWidget {
  final Ledger ledger;
  const TaoyuanPage({super.key, required this.ledger});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => TaoyuanState(ledger)..load(),
      child: Scaffold(
        appBar: AppBar(title: Text(ledger.name)),
        body: const _EventList(),
        floatingActionButton: FloatingActionButton(
          child: const Icon(Icons.add),
          onPressed: () => showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            builder: (_) => const AddEventSheet(),
          ),
        ),
      ),
    );
  }
}

class _EventList extends StatelessWidget {
  const _EventList();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TaoyuanState>();
    if (state.events.isEmpty) {
      return const Center(child: Text('还没有活动，点右下角发布一个'));
    }
    return ListView.separated(
      itemCount: state.events.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (_, i) {
        final e = state.events[i];
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
            await state.deleteEvent(e);
            return false;
          },
          child: ListTile(
            title: Text(e.title),
            subtitle: Text('状态：${e.status}'),
            trailing: e.paidCents != null
                ? Text('已到账 ${Money.formatCents(e.paidCents!)}',
                    style: const TextStyle(color: Colors.red))
                : null,
            onTap: () => showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              builder: (_) => EventDetailSheet(event: e),
            ),
          ),
        );
      },
    );
  }
}

class AddEventSheet extends StatefulWidget {
  const AddEventSheet({super.key});

  @override
  State<AddEventSheet> createState() => _AddEventSheetState();
}

class _AddEventSheetState extends State<AddEventSheet> {
  final _title = TextEditingController();
  final _content = TextEditingController();
  bool _participate = true;

  Future<void> _save() async {
    if (_title.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('请填写标题')));
      return;
    }
    final state = context.read<TaoyuanState>();
    await state.addEvent(
      title: _title.text.trim(),
      content: _content.text.trim().isEmpty ? null : _content.text.trim(),
      participate: _participate,
    );
    if (mounted) Navigator.of(context).pop();
  }

  @override
  void dispose() {
    _title.dispose();
    _content.dispose();
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
          TextField(
            controller: _title,
            decoration: const InputDecoration(labelText: '活动标题', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _content,
            decoration: const InputDecoration(labelText: '内容', border: OutlineInputBorder()),
            maxLines: 3,
          ),
          const SizedBox(height: 8),
          CheckboxListTile(
            value: _participate,
            onChanged: (v) => setState(() => _participate = v ?? true),
            title: const Text('我参与该活动'),
            controlAffinity: ListTileControlAffinity.leading,
          ),
          const SizedBox(height: 8),
          FilledButton(onPressed: _save, child: const Text('发布')),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class EventDetailSheet extends StatefulWidget {
  final TaoyuanEvent event;
  const EventDetailSheet({super.key, required this.event});

  @override
  State<EventDetailSheet> createState() => _EventDetailSheetState();
}

class _EventDetailSheetState extends State<EventDetailSheet> {
  String _stage = 'predicted';
  final _amount = TextEditingController();
  final _note = TextEditingController();
  List<EventAmount> _amounts = [];

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    _amounts = await context.read<TaoyuanState>().amountsOf(widget.event.id);
    if (mounted) setState(() {});
  }

  Future<void> _addAmount() async {
    final cents = Money.parseToCents(_amount.text);
    if (cents == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('金额格式不正确')));
      return;
    }
    try {
      await context.read<TaoyuanState>().addAmount(widget.event, {
        'stage': _stage,
        'cents': cents,
        'note': _note.text.trim().isEmpty ? null : _note.text.trim(),
      });
      _amount.clear();
      _note.clear();
      await _reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e is Exception ? e.toString() : '记金额失败')),
        );
      }
    }
  }

  @override
  void dispose() {
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
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.event.title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          const Text('金额记录', style: TextStyle(fontWeight: FontWeight.bold)),
          ..._amounts.map((a) => ListTile(
                dense: true,
                title: Text('${_stageLabel(a.stage)} ${Money.formatCents(a.cents)}'),
                subtitle: a.note != null && a.note!.isNotEmpty ? Text(a.note!) : null,
              )),
          const Divider(),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'predicted', label: Text('预测')),
              ButtonSegment(value: 'announced', label: Text('公示')),
              ButtonSegment(value: 'paid', label: Text('到账')),
            ],
            selected: {_stage},
            onSelectionChanged: (s) => setState(() => _stage = s.first),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _amount,
            decoration: const InputDecoration(labelText: '金额', prefixText: '¥', border: OutlineInputBorder()),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _note,
            decoration: const InputDecoration(labelText: '备注', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: _addAmount, child: const Text('记一笔金额')),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  String _stageLabel(String s) {
    switch (s) {
      case 'predicted':
        return '预测';
      case 'announced':
        return '公示';
      case 'paid':
        return '到账';
      default:
        return s;
    }
  }
}
