import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
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
    final red = AppColors.lightSemanticRed;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 48, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PageHeader(
            icon: '🔁',
            title: '周期记账',
            subtitle: '配一次，按周期自动记一笔',
          ),

          // ---- 说明底 ----
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: noteBg,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: noteBorder, width: 1),
            ),
            child: Text(
              '配一次，按周期自动记一笔。下次打开 App 时生成。',
              style: TextStyle(color: ink500, fontSize: 13),
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
            onTap: () => ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('已生成 ${state.count} 条记录')),
            ),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: BoxDecoration(
                color: noteBg,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: noteBorder, width: 1),
              ),
              child: Center(
                child: Text('生成记录',
                    style: TextStyle(color: ink500, fontSize: 15)),
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
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.lightBorderDashed,
                  width: 1,
                ),
              ),
              child: Center(
                child: Text('添加规则',
                    style: TextStyle(color: ink500, fontSize: 15)),
              ),
            ),
          ),
        ],
      ),
    );
  }
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
    final red = AppColors.lightSemanticRed;
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
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(rule.category,
                      style: TextStyle(color: ink900, fontSize: 15)),
                  Row(
                    children: [
                      GestureDetector(
                        onTap: () {
                          // 操作占位（演示页，无实际生成）
                        },
                        child: Text('操作',
                            style: TextStyle(color: ink500, fontSize: 13)),
                      ),
                      const SizedBox(width: 16),
                      GestureDetector(
                        onTap: () => state.remove(rule),
                        child: Text('删除',
                            style: TextStyle(color: red, fontSize: 13)),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 6),
              MoneyText(rule.cents,
                  color: rule.greenAmount ? green : ink500, fontSize: 15),
              const SizedBox(height: 4),
              Text('周期 · ${rule.period}',
                  style: TextStyle(color: ink500, fontSize: 13)),
              Text('下次 · ${rule.nextDate}',
                  style: TextStyle(color: ink400, fontSize: 13)),
            ],
          ),
        ),
      ),
    );
  }
}

/// 添加规则弹层（类别 / 金额 / 周期 / 下次）。
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
          AppPrimaryButton(label: '保存', onPressed: _save),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
