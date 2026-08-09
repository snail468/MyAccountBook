import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../api/api_client.dart';
import '../../api/recurring_api.dart';
import '../../core/money.dart';
import '../../theme/app_theme.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/money_text.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';
import 'recurring_state.dart';

/// 周期记账页（设计 2:134）。
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
    final green = AppColors.lightSemanticGreen;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PageHeader(
            icon: '🔁',
            title: '周期记账',
            subtitle: '',
          ),

          // ---- 说明底 ----
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: noteBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: noteBorder, width: 1),
            ),
            child: const Text(
              '房租、订阅、工资这类固定项配一次就行。打开首页时自动补齐到期的账。',
              style: TextStyle(color: AppColors.lightInk500, fontSize: 11),
            ),
          ),
          const SizedBox(height: 12),

          SectionLabel('规则'),
          if (state.rules.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('还没有周期规则',
                  style: TextStyle(color: ink500, fontSize: 13)),
            )
          else
            ...state.rules.map((r) => _RuleTile(rule: r)),

          const SizedBox(height: 12),

          // ---- 生成记录 ----
          GestureDetector(
            onTap: () async {
              try {
                await RecurringApi(ApiClient.instance).runDue();
                await state.load();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('已生成到期的账')),
                );
              } catch (e) {
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
                    style: TextStyle(color: ink500, fontSize: 14)),
              ),
            ),
          ),
          const SizedBox(height: 12),

          // ---- 添加规则 ----
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

/// 周期行标签：每月 1 号 / 每周 周一 · 账本名。
String _periodLine(RecurringRule r) {
  final freqLabel = r.frequency == 'weekly' ? '每周' : '每月';
  final dayLabel = r.frequency == 'weekly'
      ? '周${_weekdayName(r.dayOfWeek ?? 1)}'
      : '${r.dayOfMonth ?? 1} 号';
  final ledger = r.ledgerName ?? '';
  return '$freqLabel $dayLabel · $ledger';
}

/// 0=周日 … 6=周六 -> 中文星期名。
String _weekdayName(int dow) {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  final idx = (dow >= 0 && dow <= 6) ? dow : 1;
  return names[idx];
}

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
    final green = AppColors.lightSemanticGreen;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        frosted: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 类别（16 w500 ink900）+ 仅本机灰标 + 删除（右对齐 12 red）
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Text(rule.category,
                            style: TextStyle(
                                color: ink900,
                                fontSize: 16,
                                fontWeight: FontWeight.w500)),
                        if (rule.serverId == null) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: isDark
                                  ? AppColors.darkSurface
                                  : AppColors.lightSurfaceSubtle,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text('仅本机',
                                style: TextStyle(color: ink500, fontSize: 11)),
                          ),
                        ],
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => state.remove(rule),
                    child: Text('删除',
                        style: TextStyle(color: red, fontSize: 12)),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              MoneyText(rule.cents,
                  color: rule.greenAmount ? green : ink500, fontSize: 15),
              const SizedBox(height: 4),
              // 周期行：每月 1 号 · 账本名（12 ink500）
              Text(_periodLine(rule),
                  style: TextStyle(color: ink500, fontSize: 12)),
              // 下次行：下次：yyyy-MM-dd（11 ink400）
              Text('下次：${rule.nextDueDisplay}',
                  style: TextStyle(color: ink400, fontSize: 11)),
              const SizedBox(height: 8),
              // 操作占位：停用 / 改为仅提醒 / 启用（11 ink500，可点）
              Row(
                children: [
                  if (rule.active) ...[
                    _action(ink500, '停用', () => state.disable(rule)),
                    const SizedBox(width: 16),
                    _action(ink500, '改为仅提醒',
                        () => state.setReminderOnly(rule)),
                  ] else ...[
                    _action(ink500, '启用', () => state.enable(rule)),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _action(Color ink500, String label, VoidCallback onTap) =>
      GestureDetector(
        onTap: onTap,
        child: Text(label, style: TextStyle(color: ink500, fontSize: 11)),
      );
}

/// 添加规则弹层（类别 / 金额 / 周期 / 下次）。[D1] 保持「本地新建」，不推送服务端。
class AddRuleSheet extends StatefulWidget {
  const AddRuleSheet({super.key});

  @override
  State<AddRuleSheet> createState() => _AddRuleSheetState();
}

class _AddRuleSheetState extends State<AddRuleSheet> {
  final _category = TextEditingController();
  final _amount = TextEditingController();
  final _period = TextEditingController(text: '每月');
  final _next = TextEditingController();

  @override
  void dispose() {
    _category.dispose();
    _amount.dispose();
    _period.dispose();
    _next.dispose();
    super.dispose();
  }

  void _save() {
    final category = _category.text.trim();
    final cents = Money.parseToCents(_amount.text);
    final period = _period.text.trim().isEmpty ? '每月' : _period.text.trim();
    final next = _next.text.trim();
    if (category.isEmpty || cents == null || next.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请填写类别、金额与下次日期')),
      );
      return;
    }
    context.read<RecurringState>().add(
          category: category,
          cents: cents,
          period: period,
          nextDate: next,
        );
    if (mounted) Navigator.of(context).pop();
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
          const Text('添加规则',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          AppTextField(hint: '类别（如 房租）', controller: _category),
          const SizedBox(height: 12),
          AppTextField(hint: '金额', controller: _amount),
          const SizedBox(height: 12),
          AppTextField(hint: '周期（如 每月）', controller: _period),
          const SizedBox(height: 12),
          AppTextField(hint: '下次日期（如 2026-09-01）', controller: _next),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: AppPrimaryButton(label: '保存', onPressed: _save),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
