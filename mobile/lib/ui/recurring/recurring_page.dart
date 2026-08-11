import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/money.dart' as money;
import '../../data/local/ledger_dao.dart';
import '../../data/models/ledger.dart';
import '../../theme/app_theme.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/money.dart';
import '../widgets/page_header.dart';
import 'recurring_state.dart';

/// 周期记账页（1:1 还原 src/app/recurring/RecurringClient.tsx）。
class RecurringPage extends StatelessWidget {
  const RecurringPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => RecurringState()..load(),
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
    final state = context.watch<RecurringState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final noteBg = isDark ? AppColors.darkSurface : AppColors.lightSurfaceSubtle;
    final noteBorder = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PageHeader(
            icon: '🔁',
            title: '周期记账',
            subtitle: '房租、订阅、工资这类固定项自动记',
          ),

          // ---- 说明底（对齐网页端 bg-ink-50 / dark:bg-ink-800）----
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: noteBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: noteBorder, width: 1),
            ),
            child: RichText(
              text: TextSpan(
                style: TextStyle(color: ink500, fontSize: 11, height: 1.5),
                children: [
                  const TextSpan(text: '房租、订阅、工资这类固定项配一次就行。'),
                  TextSpan(
                    text: '打开首页时自动补齐',
                    style: TextStyle(
                        color: ink900, fontWeight: FontWeight.w600),
                  ),
                  const TextSpan(
                      text: '到期的账 —— 停用一段时间再回来，漏掉的几期会一起补上。'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // ---- 规则列表 ----
          if (state.loading)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Center(
                child: Text('加载中…',
                    style: TextStyle(color: ink400, fontSize: 13)),
              ),
            )
          else if (state.rules.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Center(
                child: Text('还没有周期规则',
                    style: TextStyle(color: ink500, fontSize: 13)),
              ),
            )
          else
            ...state.rules.map((r) => _RuleTile(rule: r)),

          const SizedBox(height: 12),

          // ---- 立即生成到期的账（仅在有规则时显示，对齐网页端）----
          if (!state.loading && state.rules.isNotEmpty)
            GestureDetector(
              onTap: () async {
                try {
                  final res = await state.runDue();
                  if (!context.mounted) return;
                  await showDialog<void>(
                    context: context,
                    builder: (_) => AlertDialog(
                      title: Text(res.created > 0
                          ? '已生成 ${res.created} 笔'
                          : '没有到期的规则'),
                      content: res.truncatedRules > 0
                          ? Text(
                              '有 ${res.truncatedRules} 条规则积压过多，只补了最近 24 期。')
                          : null,
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.of(context).pop(),
                          child: const Text('好的'),
                        ),
                      ],
                    ),
                  );
                } catch (e) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('生成失败：$e')),
                  );
                }
              },
              child: Container(
                width: double.infinity,
                height: 38,
                decoration: BoxDecoration(
                  color: noteBg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: noteBorder, width: 1),
                ),
                child: Center(
                  child: Text('立即生成到期的账',
                      style: TextStyle(color: ink500, fontSize: 12)),
                ),
              ),
            ),

          const SizedBox(height: 12),

          // ---- 添加规则 ----
          if (!state.loading)
            GestureDetector(
            onTap: () => showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              builder: (_) => ChangeNotifierProvider.value(
                value: state,
                child: const AddRuleSheet(),
              ),
            ),
            child: Container(
              width: double.infinity,
              height: 46,
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkSurface : AppColors.lightSurfaceSubtle,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isDark ? AppColors.darkBorder : AppColors.lightBorderDashed,
                  width: 1,
                ),
              ),
              child: Center(
                child: Text('＋ 添加周期规则',
                    style: TextStyle(color: ink500, fontSize: 15)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 周期规则卡片（1:1 还原 RecurringClient 的 rules.map 区块）。
class _RuleTile extends StatelessWidget {
  final RecurringRule rule;
  const _RuleTile({required this.rule});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<RecurringState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;

    final sched = buildSchedule(rule);
    final targetName = rule.target == 'work'
        ? '工作账本'
        : (rule.ledgerName ?? '普通账本');
    final scheduleText = sched != null
        ? '${describeSchedule(sched)} · $targetName'
        : (rule.period.isNotEmpty ? '${rule.period} · $targetName' : targetName);

    // 状态行：停用 -> 已停用；否则下次日期（已过期则「已到结束日期」）；仅提醒追加后缀。
    final String status;
    if (!rule.active) {
      status = '已停用';
    } else {
      final String nextText;
      if (sched != null) {
        final up = upcomingDate(
          sched,
          rule.lastGeneratedAt != null
              ? DateTime.tryParse(rule.lastGeneratedAt!)
              : null,
          DateTime.now(),
        );
        nextText = up != null ? '下次：${_ymd(up)}' : '已到结束日期';
      } else {
        nextText = rule.nextDate.isNotEmpty
            ? '下次：${rule.nextDate}'
            : '已到结束日期';
      }
      status = rule.autoCreate ? nextText : '$nextText · 仅提醒不自动记';
    }

    final amountColor = rule.greenAmount ? green : ink500;
    // 网页端手动给收入加 +、支出加 -；这里传带符号的分以复用 Money 组件的千分位。
    final signedCents = rule.direction == 'income' ? rule.cents : -rule.cents;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        frosted: false,
        child: Opacity(
          opacity: rule.active ? 1.0 : 0.6,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // 类别 + 金额（同行，金额随方向 +/− 并取色）
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.baseline,
                            textBaseline: TextBaseline.alphabetic,
                            children: [
                              Expanded(
                                child: Text(rule.category,
                                    style: TextStyle(
                                        color: ink900,
                                        fontSize: 16,
                                        fontWeight: FontWeight.w500),
                                    overflow: TextOverflow.ellipsis),
                              ),
                              const SizedBox(width: 8),
                              Money(
                                cents: signedCents,
                                sign: true,
                                style: TextStyle(
                                    color: amountColor,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w500),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          // 排期描述 · 目标账本
                          Text(scheduleText,
                              style: TextStyle(color: ink500, fontSize: 12)),
                          if (rule.note != null && rule.note!.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(rule.note!,
                                style: TextStyle(color: ink400, fontSize: 12),
                                overflow: TextOverflow.ellipsis),
                          ],
                          const SizedBox(height: 4),
                          // 下次 / 已停用 / 仅提醒
                          Text(status,
                              style: TextStyle(color: ink400, fontSize: 11)),
                        ],
                      ),
                    ),
                    GestureDetector(
                      onTap: () => _confirmDelete(context, state, rule),
                      child: Text('删除',
                          style: TextStyle(color: red, fontSize: 12)),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // 操作：停用/启用 + 改为仅提醒/改为自动记账
                Row(
                  children: [
                    _link(ink500, rule.active ? '停用' : '启用',
                        () => rule.active ? state.disable(rule) : state.enable(rule)),
                    const SizedBox(width: 12),
                    _link(
                        ink500,
                        rule.autoCreate ? '改为仅提醒' : '改为自动记账',
                        () => rule.autoCreate
                            ? state.setReminderOnly(rule)
                            : state.setAutoCreate(rule)),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _link(Color color, String label, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Text(label,
            style: TextStyle(
                color: color, fontSize: 12, decoration: TextDecoration.underline)),
      );

  Future<void> _confirmDelete(
      BuildContext context, RecurringState state, RecurringRule r) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('删除「${r.category}」这条规则？'),
        content: const Text('已经生成的账目不会被删除 —— 那些是真实发生过的支出。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(
                foregroundColor: AppColors.lightSemanticRed),
            child: const Text('删除规则'),
          ),
        ],
      ),
    );
    if (ok == true) await state.remove(r);
  }
}

/// yyyy-MM-dd。
String _ymd(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// 添加规则弹层（1:1 还原 RecurringClient 的 adding 表单区块）。
class AddRuleSheet extends StatefulWidget {
  const AddRuleSheet({super.key});

  @override
  State<AddRuleSheet> createState() => _AddRuleSheetState();
}

class _AddRuleSheetState extends State<AddRuleSheet> {
  String _direction = 'expense'; // 'expense' | 'income'
  String _target = 'work'; // 'work' | 'general'
  String? _ledgerId;
  final _category = TextEditingController();
  final _amount = TextEditingController();
  final _note = TextEditingController();
  String _frequency = 'monthly'; // 'monthly' | 'weekly'
  int _dayOfMonth = 1;
  int _dayOfWeek = 1;
  String? _startDate;
  String? _endDate;
  bool _autoCreate = true;
  List<Ledger> _ledgers = const [];

  @override
  void initState() {
    super.initState();
    _startDate = _ymd(DateTime.now());
    _loadLedgers();
  }

  Future<void> _loadLedgers() async {
    final ledgers = await LedgerDao().listByKind('general');
    if (!mounted) return;
    setState(() {
      _ledgers = ledgers;
      // 网页端默认：有普通账本则 general，否则 work。
      _target = ledgers.isNotEmpty ? 'general' : 'work';
      if (ledgers.isNotEmpty) _ledgerId = ledgers.first.id;
    });
  }

  @override
  void dispose() {
    _category.dispose();
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg)));
  }

  void _save() {
    final category = _category.text.trim();
    final cents = money.Money.parseToCents(_amount.text);
    if (category.isEmpty) {
      _snack('请填写类别');
      return;
    }
    if (cents == null || cents <= 0) {
      _snack('金额要是正数');
      return;
    }
    if (_startDate == null || _startDate!.isEmpty) {
      _snack('请选择开始日期');
      return;
    }

    String? resolvedLedgerId;
    String? resolvedLedgerName;
    if (_target == 'work') {
      resolvedLedgerName = '工作账本'; // 落库时按本地 work 账本 id 解析
    } else {
      if (_ledgerId == null || _ledgerId!.isEmpty) {
        _snack('请选择目标账本');
        return;
      }
      resolvedLedgerId = _ledgerId;
      var name = '普通账本';
      for (final l in _ledgers) {
        if (l.id == _ledgerId) {
          name = l.name;
          break;
        }
      }
      resolvedLedgerName = name;
    }

    context.read<RecurringState>().add(
          category: category,
          cents: cents,
          direction: _direction,
          target: _target,
          ledgerId: resolvedLedgerId,
          ledgerName: resolvedLedgerName,
          note: _note.text.trim(),
          frequency: _frequency,
          dayOfMonth: _frequency == 'monthly' ? _dayOfMonth : null,
          dayOfWeek: _frequency == 'weekly' ? _dayOfWeek : null,
          startDate: _startDate!,
          endDate: _endDate,
          autoCreate: _autoCreate,
        );
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _pickDate(bool isEnd) async {
    final initial = isEnd
        ? (_endDate != null
            ? DateTime.tryParse(_endDate!) ?? DateTime.now()
            : DateTime.now())
        : (_startDate != null
            ? DateTime.tryParse(_startDate!) ?? DateTime.now()
            : DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null && mounted) {
      final s =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      setState(() {
        if (isEnd) {
          _endDate = s;
        } else {
          _startDate = s;
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final fill = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final ink100 = isDark ? AppColors.darkInk100 : AppColors.lightInk100;

    return Container(
      decoration: BoxDecoration(
        color: fill,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(
          16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('添加规则',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),

            // 方向：支出 / 收入
            Row(
              children: [
                _seg(isDark: isDark, active: _direction == 'expense', label: '支出',
                    onTap: () => setState(() => _direction = 'expense')),
                const SizedBox(width: 8),
                _seg(isDark: isDark, active: _direction == 'income', label: '收入',
                    onTap: () => setState(() => _direction = 'income')),
              ],
            ),
            const SizedBox(height: 12),

            // 目标账本：工作账本 + 普通账本列表
            Container(
              height: 52,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: fill,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: border, width: 1),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  isExpanded: true,
                  value: _target == 'work' ? 'work' : (_ledgerId ?? ''),
                  hint: const Text('选择目标账本'),
                  items: [
                    const DropdownMenuItem(
                        value: 'work', child: Text('工作账本')),
                    for (final l in _ledgers)
                      DropdownMenuItem(value: l.id, child: Text(l.name)),
                  ],
                  onChanged: (v) {
                    if (v == null) return;
                    setState(() {
                      if (v == 'work') {
                        _target = 'work';
                      } else {
                        _target = 'general';
                        _ledgerId = v;
                      }
                    });
                  },
                ),
              ),
            ),
            const SizedBox(height: 12),

            AppTextField(hint: '类别，如 房租', controller: _category),
            const SizedBox(height: 12),
            AppTextField(hint: '金额（元）', controller: _amount),
            const SizedBox(height: 12),
            AppTextField(hint: '备注（可选）', controller: _note),
            const SizedBox(height: 12),

            // 频率：按月 / 按周
            Row(
              children: [
                _seg(isDark: isDark, active: _frequency == 'monthly', label: '按月',
                    onTap: () => setState(() => _frequency = 'monthly')),
                const SizedBox(width: 8),
                _seg(isDark: isDark, active: _frequency == 'weekly', label: '按周',
                    onTap: () => setState(() => _frequency = 'weekly')),
              ],
            ),
            const SizedBox(height: 12),

            // 每月几号 / 每周几
            if (_frequency == 'monthly')
              _labelField(
                label: '每月几号',
                border: border,
                fill: fill,
                hintColor: ink400,
                textColor: ink900,
                value: '$_dayOfMonth 号${_dayOfMonth > 28 ? '（不足则当月最后一天）' : ''}',
                onTap: () => _pickDayOfMonth(context),
              )
            else
              _labelField(
                label: '每周几',
                border: border,
                fill: fill,
                hintColor: ink400,
                textColor: ink900,
                value: const ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][_dayOfWeek],
                onTap: () => _pickDayOfWeek(context),
              ),
            const SizedBox(height: 12),

            // 开始 / 结束日期
            Row(
              children: [
                Expanded(
                  child: _dateField(
                    label: '开始',
                    value: _startDate,
                    onTap: () => _pickDate(false),
                    border: border,
                    fill: fill,
                    hintColor: ink400,
                    textColor: ink900,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _dateField(
                    label: '结束（可选）',
                    value: _endDate,
                    onTap: () => _pickDate(true),
                    border: border,
                    fill: fill,
                    hintColor: ink400,
                    textColor: ink900,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // 到期自动记账
            Row(
              children: [
                Checkbox(
                  value: _autoCreate,
                  onChanged: (v) => setState(() => _autoCreate = v ?? true),
                  activeColor: isDark ? AppColors.darkInk100 : AppColors.lightInk900,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                Expanded(
                  child: Text('到期自动记账（不勾则只在列表里提示）',
                      style: TextStyle(color: ink500, fontSize: 12)),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // 保存 / 取消
            Row(
              children: [
                Expanded(
                  child: AppPrimaryButton(label: '保存', onPressed: _save),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () => Navigator.of(context).pop(),
                  child: Container(
                    height: 52,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(
                      color: isDark ? AppColors.darkBorder : AppColors.lightInk100,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Center(
                      child: Text('取消',
                          style: TextStyle(color: ink100, fontSize: 14)),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  /// 分段按钮（active = ink-900/dark:ink-100 底 + 白/dark:ink-900 字；inactive = 描边底）。
  Widget _seg({
    required bool isDark,
    required bool active,
    required String label,
    required VoidCallback onTap,
  }) {
    final activeBg = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final activeText = isDark ? AppColors.darkCtaText : Colors.white;
    final inactiveBg = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final inactiveText = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 40,
          decoration: BoxDecoration(
            color: active ? activeBg : inactiveBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
                color: active ? Colors.transparent : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
                width: 1),
          ),
          child: Center(
            child: Text(label,
                style: TextStyle(
                    color: active ? activeText : inactiveText, fontSize: 14)),
          ),
        ),
      ),
    );
  }

  /// 带标签的只读选择框（每月几号 / 每周几）。
  Widget _labelField({
    required String label,
    required Color border,
    required Color fill,
    required Color hintColor,
    required Color textColor,
    required String value,
    required VoidCallback onTap,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: hintColor, fontSize: 12)),
        const SizedBox(height: 4),
        GestureDetector(
          onTap: onTap,
          child: Container(
            height: 52,
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: fill,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: border, width: 1),
            ),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(value,
                  style: TextStyle(color: textColor, fontSize: 14)),
            ),
          ),
        ),
      ],
    );
  }

  /// 日期选择框（开始 / 结束）。
  Widget _dateField({
    required String label,
    required String? value,
    required VoidCallback onTap,
    required Color border,
    required Color fill,
    required Color hintColor,
    required Color textColor,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: hintColor, fontSize: 12)),
        const SizedBox(height: 4),
        GestureDetector(
          onTap: onTap,
          child: Container(
            height: 52,
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: fill,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: border, width: 1),
            ),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(value ?? '选择日期',
                  style: TextStyle(
                      color: value == null ? hintColor : textColor, fontSize: 14)),
            ),
          ),
        ),
      ],
    );
  }

  /// 每月几号选择（1-31，底部弹窗）。
  Future<void> _pickDayOfMonth(BuildContext context) async {
    final picked = await showModalBottomSheet<int>(
      context: context,
      builder: (_) => SafeArea(
        child: ListView(
          children: [
            for (int n = 1; n <= 31; n++)
              ListTile(
                title: Text('$n 号${n > 28 ? '（不足则当月最后一天）' : ''}'),
                onTap: () => Navigator.of(context).pop(n),
              ),
          ],
        ),
      ),
    );
    if (picked != null && mounted) setState(() => _dayOfMonth = picked);
  }

  /// 每周几选择（周日..周六，底部弹窗）。
  Future<void> _pickDayOfWeek(BuildContext context) async {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    final picked = await showModalBottomSheet<int>(
      context: context,
      builder: (_) => SafeArea(
        child: ListView(
          children: [
            for (int i = 0; i < 7; i++)
              ListTile(
                title: Text(names[i]),
                onTap: () => Navigator.of(context).pop(i),
              ),
          ],
        ),
      ),
    );
    if (picked != null && mounted) setState(() => _dayOfWeek = picked);
  }
}
