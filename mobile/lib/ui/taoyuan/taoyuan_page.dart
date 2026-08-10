import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/money.dart';
import '../../data/models/ledger.dart';
import '../../data/models/taoyuan_event.dart';
import '../../state/taoyuan_state.dart';
import '../../theme/app_theme.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';

/// 桃源账本页（设计 2:129 重做）：头部 + 状态筛选 + 活动卡。

class TaoyuanPage extends StatelessWidget {
  final Ledger ledger;
  const TaoyuanPage({super.key, required this.ledger});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => TaoyuanState(ledger)..load(),
      child: Scaffold(
        backgroundColor: AppTheme.scaffoldBackground(context),
        body: const _Body(),
      ),
    );
  }
}

/// 状态分段选项（已发布/预测/公示/到账），映射到 [TaoyuanEvent.status]。
const List<({String label, String value})> _kStatusOptions = [
  (label: '已发布', value: 'published'),
  (label: '预测', value: 'predicted'),
  (label: '公示', value: 'announced'),
  (label: '到账', value: 'paid'),
];

/// 状态 pill 配色（品牌色，跨主题固定）。
({Color bg, Color fg, String label}) _statusStyle(String status) {
  switch (status) {
    case 'published':
      return (bg: Color(0xFF0F172A), fg: Colors.white, label: '已发布');
    case 'predicted':
      return (bg: Color(0xFFF1F5F9), fg: Color(0xFF64748B), label: '预测');
    case 'announced':
      return (bg: Color(0xFFFEF3C7), fg: Color(0xFF92400E), label: '公示');
    case 'paid':
      return (bg: Color(0xFFDCFCE7), fg: Color(0xFF166534), label: '到账');
    default:
      return (bg: Color(0xFFF1F5F9), fg: Color(0xFF64748B), label: status);
  }
}

class _Body extends StatefulWidget {
  const _Body();

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  String _status = 'published'; // 默认选中"已发布"

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TaoyuanState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;

    final filtered =
        state.events.where((e) => e.status == _status).toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ---- 统一头部：左上回家 + 右上眼/设置 + 左侧返回 + 标题（内含于 PageHeader）----
          PageHeader(
            icon: '🌸',
            title: state.ledger.name,
            subtitle: '活动发布 → 预测 → 公示 → 发钱',
          ),
          const SizedBox(height: 16),

          // ---- 状态筛选分段 ----
          _StatusSegmented(
            value: _status,
            onChanged: (v) => setState(() => _status = v),
          ),
          const SizedBox(height: 12),

          // ---- 新建活动 ----
          AppPrimaryButton(
            label: '新建活动',
            onPressed: () => showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              builder: (_) => ChangeNotifierProvider.value(
                value: state,
                child: const AddEventSheet(),
              ),
            ),
          ),
          const SizedBox(height: 8),
          SectionLabel('活动'),

          // ---- 活动卡 ----
          if (filtered.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('该状态下还没有活动',
                  style: TextStyle(color: ink500, fontSize: 13)),
            )
          else
            ...filtered.map((e) => _EventCard(e: e)),
        ],
      ),
    );
  }
}

/// 状态筛选分段控件（选中 = ink900 填充 + 白字；未选 = 微妙底 #F1F5F9 + ink500 字）。
class _StatusSegmented extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;
  const _StatusSegmented({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final selectedBg = isDark ? AppColors.darkCtaFill : AppColors.lightInk900;
    final selectedText = isDark ? AppColors.darkCtaText : Colors.white;
    final unselBg =
        isDark ? AppColors.darkSurface : AppColors.lightSurfaceSubtle;
    final unselText = isDark ? AppColors.darkInk100 : AppColors.lightInk500;

    return Container(
      decoration: BoxDecoration(
        color: unselBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
          width: 1,
        ),
      ),
      child: Row(
        children: _kStatusOptions.map((o) {
          final sel = o.value == value;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChanged(o.value),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: sel ? selectedBg : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Center(
                  child: Text(
                    o.label,
                    style: TextStyle(
                      color: sel ? selectedText : unselText,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  final TaoyuanEvent e;
  const _EventCard({required this.e});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final state = context.watch<TaoyuanState>();

    final pill = _statusStyle(e.status);
    final rewardText = e.reward != null && e.reward!.isNotEmpty
        ? '现金奖励 ${e.reward}'
        : null;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        onTap: () => showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          builder: (_) => ChangeNotifierProvider.value(
            value: state,
            child: EventDetailSheet(event: e),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(e.title,
                        style: TextStyle(
                            color: ink900, fontSize: 16, fontWeight: FontWeight.w600)),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: pill.bg,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(pill.label,
                        style: TextStyle(color: pill.fg, fontSize: 12)),
                  ),
                ],
              ),
              if (rewardText != null) ...[
                const SizedBox(height: 6),
                Text(rewardText, style: TextStyle(color: ink500, fontSize: 13)),
              ],
            ],
          ),
        ),
      ),
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
          Text(widget.event.title,
              style: Theme.of(context).textTheme.titleLarge),
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
