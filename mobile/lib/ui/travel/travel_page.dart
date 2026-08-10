import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/exceptions.dart';
import '../../core/money.dart';
import '../../data/models/ledger.dart';
import '../../data/models/trip.dart';
import '../../state/auth_state.dart';
import '../../state/travel_state.dart';
import '../../theme/app_theme.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/money_text.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';

/// 旅游账本页（设计 2:130 重做）：头部 + 成员管理 + 汇总/每日曲线/结算单。

class TravelPage extends StatelessWidget {
  final Ledger ledger;
  const TravelPage({super.key, required this.ledger});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => TravelState(ledger)..load(),
      child: Scaffold(
        backgroundColor: AppTheme.scaffoldBackground(context),
        body: const _Body(),
        floatingActionButton: Builder(
          builder: (ctx) => FloatingActionButton(
            child: const Icon(Icons.add),
            onPressed: () => showModalBottomSheet(
              context: ctx,
              isScrollControlled: true,
              builder: (_) => ChangeNotifierProvider.value(
                value: ctx.read<TravelState>(),
                child: const AddExpenseSheet(),
              ),
            ),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    // 汇总
    final total = state.expenses
        .where((e) => e.deletedAt == null)
        .fold(0, (s, e) => s + e.amountBaseCents);
    final headCount = state.members.length;
    final perHead = headCount > 0 ? total ~/ headCount : 0;

    // 我欠：匹配当前用户名对应成员，取其净欠（正数部分）
    int myOwe = 0;
    final username = context.read<AuthState?>()?.username;
    if (username != null) {
      final me = state.members
          .where((m) => m.displayName == username)
          .firstOrNull;
      if (me != null) {
        final bal = state.balances()[me.id] ?? 0;
        myOwe = bal < 0 ? -bal : 0;
      }
    }

    // 元信息
    final startStr = state.ledger.startDate != null
        ? _md(state.ledger.startDate!)
        : '08/01';
    final endStr = state.ledger.endDate != null
        ? _md(state.ledger.endDate!)
        : '08/07';
    final people = headCount > 0 ? headCount : 3;
    final meta = '$people 人 · $startStr-$endStr';

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ---- 统一头部：左上回家 + 右上眼/设置 + 左侧返回 + 标题（内含于 PageHeader）----
          PageHeader(
            icon: '✈️',
            title: state.ledger.name,
            subtitle: meta,
          ),
          const SizedBox(height: 16),

          // ---- 汇总卡 ----
          Row(
            children: [
              Expanded(
                child: _SummaryTile(title: '总花费', cents: total, color: ink900),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _SummaryTile(title: '人均', cents: perHead, color: ink900),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _SummaryTile(
                    title: '我欠', cents: myOwe, color: red, titleColor: ink900),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // ---- 每日花费曲线 ----
          _DailyCard(),
          const SizedBox(height: 16),

          // ---- 结算单 ----
          AppPrimaryButton(
            label: '查看结算单',
            onPressed: () => _showSettlement(context, state),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: SectionLabel('旅行记录')),
              IconButton(
                icon: const Icon(Icons.people_outline),
                tooltip: '成员管理',
                onPressed: () => showDialog(
                  context: context,
                  builder: (_) => ChangeNotifierProvider.value(
                    value: state,
                    child: const MembersDialog(),
                  ),
                ),
              ),
            ],
          ),

          // ---- 记录列表 ----
          if (state.expenses.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('还没有花费，点右下角记一笔',
                  style: TextStyle(color: ink500, fontSize: 13)),
            )
          else
            ...state.expenses.map((e) => _ExpenseCard(e: e)),
        ],
      ),
    );
  }

  String _md(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms);
    return '${d.month.toString().padLeft(2, '0')}/${d.day.toString().padLeft(2, '0')}';
  }

  void _showSettlement(BuildContext context, TravelState state) {
    final transfers = state.settlement();
    final nameOf = (id) =>
        state.members.where((m) => m.id == id).firstOrNull?.displayName ?? id;
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('AA 结算单'),
        content: SizedBox(
          width: double.maxFinite,
          child: transfers.isEmpty
              ? const Text('暂无需要结算的转账 🎉')
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: transfers
                      .map((t) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Text(
                                '${nameOf(t.fromId)} → ${nameOf(t.toId)}  ${Money.formatCents(t.amountCents)}'),
                          ))
                      .toList(),
                ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(context).pop(), child: const Text('关闭')),
        ],
      ),
    );
  }
}

class _SummaryTile extends StatelessWidget {
  final String title;
  final int cents;
  final Color color;
  final Color? titleColor;
  const _SummaryTile({
    required this.title,
    required this.cents,
    required this.color,
    this.titleColor,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final tColor = titleColor ?? ink500;
    return AppCard(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: TextStyle(color: tColor, fontSize: 12)),
            const SizedBox(height: 6),
            MoneyText(cents, fontSize: 17, fontWeight: FontWeight.w700, color: color),
          ],
        ),
      ),
    );
  }
}

/// 每日花费曲线卡（简单 CustomPaint 折线图）。
class _DailyCard extends StatelessWidget {
  const _DailyCard();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TravelState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    // 按日汇总（YYYY-MM-DD -> 分）
    final byDay = <String, int>{};
    for (final e in state.expenses) {
      if (e.deletedAt != null) continue;
      final d = DateTime.fromMillisecondsSinceEpoch(e.occurredAt);
      final key =
          '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      byDay.putIfAbsent(key, () => 0);
      byDay[key] = byDay[key]! + e.amountBaseCents;
    }
    final days = byDay.keys.toList()..sort();
    final values = days.map((d) => byDay[d]!).toList();

    return AppCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('每日花费', style: TextStyle(color: ink500, fontSize: 13)),
            const SizedBox(height: 12),
            if (values.isEmpty)
              Text('暂无花费数据',
                  style: TextStyle(color: ink500, fontSize: 13))
            else
              LayoutBuilder(
                builder: (context, constraints) {
                  final w = constraints.maxWidth;
                  return SizedBox(
                    height: 120,
                    width: w,
                    child: CustomPaint(
                      size: Size(w, 120),
                      painter: _SpendingPainter(
                        values: values,
                        color: ink900,
                      ),
                    ),
                  );
                },
              ),
          ],
        ),
      ),
    );
  }
}

class _SpendingPainter extends CustomPainter {
  final List<int> values;
  final Color color;
  const _SpendingPainter({required this.values, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    final maxV = values.reduce((a, b) => a > b ? a : b).toDouble();
    final minV = 0.0;
    final span = (maxV - minV) == 0 ? 1.0 : (maxV - minV);
    final pad = 12.0;
    final w = size.width - pad * 2;
    final h = size.height - pad * 2;
    final n = values.length;

    final points = <Offset>[];
    for (var i = 0; i < n; i++) {
      final x = pad + (n == 1 ? w / 2 : w * i / (n - 1));
      final y = pad + h * (1 - (values[i].toDouble() - minV) / span);
      points.add(Offset(x, y));
    }

    final linePaint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    if (points.length > 1) {
      final path = Path()..moveTo(points.first.dx, points.first.dy);
      for (var i = 1; i < points.length; i++) {
        path.lineTo(points[i].dx, points[i].dy);
      }
      canvas.drawPath(path, linePaint);
    }

    final dotPaint = Paint()..color = color;
    for (final p in points) {
      canvas.drawCircle(p, 3.5, dotPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _SpendingPainter old) =>
      old.values != values || old.color != color;
}

class _ExpenseCard extends StatelessWidget {
  final TripExpense e;
  const _ExpenseCard({required this.e});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TravelState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final payer = state.members.where((m) => m.id == e.payerId).firstOrNull;

    final d = DateTime.fromMillisecondsSinceEpoch(e.occurredAt);
    final dateStr =
        '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        child: Dismissible(
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
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(dateStr, style: TextStyle(color: ink500, fontSize: 12)),
                      const SizedBox(height: 4),
                      Text(e.title,
                          style: TextStyle(color: ink900, fontSize: 15)),
                      const SizedBox(height: 2),
                      Text(
                          '${e.category} · ${payer?.displayName ?? '?'} · ${e.phase == 'pre' ? '行前' : '途中'}',
                          style: TextStyle(color: ink500, fontSize: 12)),
                    ],
                  ),
                ),
                MoneyText(e.amountBaseCents, color: ink900, fontSize: 16),
              ],
            ),
          ),
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
            const Text('填用户名邀请已注册用户；纯名字则作为占位成员',
                style: TextStyle(fontSize: 12)),
          ],
        ),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(context).pop(), child: const Text('关闭')),
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
