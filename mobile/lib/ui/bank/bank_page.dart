import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/page_header.dart';
import '../widgets/section_label.dart';
import 'bank_state.dart';

/// 银行卡备份页（设计 2:133）。
class BankPage extends StatelessWidget {
  const BankPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => BankState()..load(),
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
    final state = context.watch<BankState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PageHeader(
            icon: '💳',
            title: '银行卡备份',
            subtitle: '加密存储卡号 · 查看需验密码',
          ),

          // ---- 添加银行卡 ----
          AppPrimaryButton(
            label: '＋ 添加银行卡',
            onPressed: () => showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              builder: (_) => ChangeNotifierProvider.value(
                value: state,
                child: const AddBankSheet(),
              ),
            ),
          ),
          const SizedBox(height: 8),

          SectionLabel('银行卡'),
          if (state.cards.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('还没有备份的银行卡',
                  style: TextStyle(color: ink500, fontSize: 13)),
            )
          else
            ...state.cards.map((c) => _BankCardTile(card: c)),
        ],
      ),
    );
  }
}

class _BankCardTile extends StatelessWidget {
  final BankCard card;
  const _BankCardTile({required this.card});

  /// 卡图标按类型区分：[D6] 储蓄卡🏦 / 信用卡🏧。
  String get _icon => card.type == '信用卡' ? '🏧' : '🏦';

  @override
  Widget build(BuildContext context) {
    final state = context.watch<BankState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        frosted: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_icon, style: TextStyle(fontSize: 24, color: ink900)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(card.bank,
                              style: TextStyle(color: ink900, fontSize: 18)),
                        ),
                        const SizedBox(width: 8),
                        // 类型右对齐（储蓄卡/信用卡）。
                        Text(card.type,
                            style: TextStyle(color: ink500, fontSize: 13)),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text('**** ${card.last4}',
                        style: TextStyle(color: ink500, fontSize: 14)),
                    if (card.alias != null && card.alias!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(card.alias!,
                            style: TextStyle(color: ink500, fontSize: 13)),
                      ),
                    if (card.holder != null && card.holder!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(card.holder!,
                            style: TextStyle(color: ink500, fontSize: 13)),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              GestureDetector(
                onTap: () => state.remove(card),
                child: Text('删除',
                    style: TextStyle(color: ink500, fontSize: 13)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 添加银行卡弹层（新增 alias / holder 字段，对应服务端明文扩展字段 [D2]）。
class AddBankSheet extends StatefulWidget {
  const AddBankSheet({super.key});

  @override
  State<AddBankSheet> createState() => _AddBankSheetState();
}

class _AddBankSheetState extends State<AddBankSheet> {
  final _bank = TextEditingController();
  final _type = TextEditingController();
  final _number = TextEditingController();
  final _alias = TextEditingController();
  final _holder = TextEditingController();

  @override
  void dispose() {
    _bank.dispose();
    _type.dispose();
    _number.dispose();
    _alias.dispose();
    _holder.dispose();
    super.dispose();
  }

  void _save() {
    final bank = _bank.text.trim();
    final number = _number.text.trim();
    if (bank.isEmpty || number.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请填写银行名与卡号')),
      );
      return;
    }
    final alias = _alias.text.trim();
    final holder = _holder.text.trim();
    context.read<BankState>().add(
          bank: bank,
          type: _type.text.trim().isEmpty ? '储蓄卡' : _type.text.trim(),
          number: number,
          alias: alias.isEmpty ? null : alias,
          holder: holder.isEmpty ? null : holder,
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
          const Text('添加银行卡',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          AppTextField(hint: '银行名', controller: _bank),
          const SizedBox(height: 12),
          AppTextField(hint: '卡片类型（如 储蓄卡 / 信用卡）', controller: _type),
          const SizedBox(height: 12),
          AppTextField(hint: '卡号', controller: _number),
          const SizedBox(height: 12),
          AppTextField(hint: '卡别名（选填）', controller: _alias),
          const SizedBox(height: 12),
          AppTextField(hint: '持卡人（选填）', controller: _holder),
          const SizedBox(height: 16),
          AppPrimaryButton(label: '保存', onPressed: _save),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
