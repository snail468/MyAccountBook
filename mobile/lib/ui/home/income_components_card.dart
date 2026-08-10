import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/reward_method.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/money.dart';
import '../../core/money.dart' as money;

/// 首页"总收入 A"的单个分量（对齐网页端 IncomeComponentsCard.IncomeComponent）。
///
/// [cents] 为金额绝对值（正数），[sign] 决定加/减；[enabled] 为默认是否计入 A。
class IncomeComponent {
  final String key;
  final String letter;
  final String name;
  final int cents;
  final int sign; // 1 = 进项（加），-1 = 出项（减）
  final bool enabled;

  const IncomeComponent({
    required this.key,
    required this.letter,
    required this.name,
    required this.cents,
    required this.sign,
    this.enabled = true,
  });
}

/// 首页顶部"总收入 A"卡片（对齐网页端 IncomeComponentsCard）。
///
/// - 公式串「总收入 A = B + C - D (元)」，第一项恒用字母打头，后续按符号拼 ` + X` / ` - X`。
/// - A 为品牌粉（负值换语义红），受「隐藏金额」开关影响（用 [Money]）。
/// - 仅 2+ 分量时显示 ⚙ 设置：本地持久化各分量启用状态（对齐网页端
///   `/api/user/preferences` 的 incomeComponents 开关）。
/// - 最底部「以下奖励不计入 A」区：其它金额 / 个数 / 文字类奖励，仅存档展示。
class IncomeComponentsCard extends StatefulWidget {
  final List<IncomeComponent> components;
  final Map<String, int> otherReward;
  final Map<String, int> countReward;
  final Map<String, List<String>> textReward;

  const IncomeComponentsCard({
    super.key,
    required this.components,
    this.otherReward = const {},
    this.countReward = const {},
    this.textReward = const {},
  });

  @override
  State<IncomeComponentsCard> createState() => _IncomeComponentsCardState();
}

class _IncomeComponentsCardState extends State<IncomeComponentsCard> {
  static const String _kOverrides = 'incomeComponentOverrides';
  Map<String, bool> _overrides = {};

  @override
  void initState() {
    super.initState();
    _loadOverrides();
  }

  Future<void> _loadOverrides() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_kOverrides);
      if (raw != null && raw.isNotEmpty) {
        final decoded = jsonDecode(raw) as Map<String, dynamic>;
        final map = <String, bool>{};
        for (final e in decoded.entries) {
          map[e.key] = e.value is bool ? e.value as bool : e.value == true;
        }
        if (mounted) setState(() => _overrides = map);
      }
    } catch (_) {
      // 忽略
    }
  }

  Future<void> _saveOverrides(Map<String, bool> next) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kOverrides, jsonEncode(next));
    } catch (_) {
      // 忽略
    }
  }

  bool _isEnabled(IncomeComponent c) => _overrides[c.key] ?? c.enabled;

  List<IncomeComponent> get _enabled =>
      widget.components.where(_isEnabled).toList();

  int get _A => _enabled.fold(0, (sum, c) => sum + c.cents * c.sign);

  String get _formula {
    final enabled = _enabled;
    if (enabled.isEmpty) return '总收入 A（未启用任何来源）';
    return '总收入 A = ${enabled.asMap().entries.map((e) {
      final i = e.key;
      final c = e.value;
      return i == 0 ? c.letter : '${c.sign == 1 ? "+" : "-"} ${c.letter}';
    }).join(' ')} (元)';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final brandPink =
        isDark ? AppColors.darkBrandPink : AppColors.lightBrandPink;
    final semanticRed =
        isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    final enabled = _enabled;
    final hasExtra = widget.otherReward.isNotEmpty ||
        widget.countReward.isNotEmpty ||
        widget.textReward.isNotEmpty;

    return AppCard(
      radius: 24,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    _formula,
                    style: TextStyle(color: ink500, fontSize: 12),
                  ),
                ),
                if (widget.components.length >= 2)
                  GestureDetector(
                    onTap: () => _openSettings(context),
                    child: Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: Text('⚙',
                          style: TextStyle(color: ink400, fontSize: 16)),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            // A 数字：品牌粉（负→红），受隐藏金额开关影响。
            Money(
              cents: _A,
              style: TextStyle(
                color: _A < 0 ? semanticRed : brandPink,
                fontSize: 44,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (enabled.isNotEmpty) ...[
              const SizedBox(height: 16),
              ...enabled.map((c) => _ComponentRow(
                    c: c,
                    ink500: ink500,
                    ink900: ink900,
                    semanticRed: semanticRed,
                  )),
            ],
            if (hasExtra) ...[
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.only(top: 12),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(
                      color: isDark
                          ? AppColors.darkBorder
                          : AppColors.lightBorder,
                      width: 1,
                    ),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 4),
                    Text('以下奖励不计入 A，仅存档展示',
                        style: TextStyle(color: ink500, fontSize: 11)),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 12,
                      runSpacing: 4,
                      children: [
                        ...widget.otherReward.entries.map((e) => Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(rewardMethodLabel(e.key),
                                    style: TextStyle(color: ink500, fontSize: 12)),
                                const SizedBox(width: 4),
                                Money(
                                  cents: e.value,
                                  style: TextStyle(
                                      color: ink500, fontSize: 12),
                                ),
                              ],
                            )),
                        ...widget.countReward.entries.map((e) => Text(
                              '${rewardMethodLabel(e.key)} ${e.value} 个',
                              style: TextStyle(color: ink500, fontSize: 12),
                            )),
                        ...widget.textReward.entries.map((e) => Text(
                              '${rewardMethodLabel(e.key)}：${e.value.join(' / ')}',
                              style: TextStyle(color: ink500, fontSize: 12),
                            )),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _ComponentRow({
    required IncomeComponent c,
    required Color ink500,
    required Color ink900,
    required Color semanticRed,
  }) {
    final isSubtract = c.sign == -1;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Expanded(
            child: Text(
              '${c.letter}  ${c.name}',
              style: TextStyle(color: ink500, fontSize: 12),
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (isSubtract)
                Text('−', style: TextStyle(color: semanticRed, fontSize: 16)),
              Money(
                cents: c.cents,
                style: TextStyle(
                  color: isSubtract ? semanticRed : ink900,
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _openSettings(BuildContext context) {
    final local = <String, bool>{};
    for (final c in widget.components) {
      local[c.key] = _isEnabled(c);
    }
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _SettingsSheet(
        components: widget.components,
        initial: local,
        onSave: (next) async {
          setState(() => _overrides = next);
          await _saveOverrides(next);
        },
      ),
    );
  }
}

class _SettingsSheet extends StatefulWidget {
  final List<IncomeComponent> components;
  final Map<String, bool> initial;
  final Future<void> Function(Map<String, bool>) onSave;

  const _SettingsSheet({
    required this.components,
    required this.initial,
    required this.onSave,
  });

  @override
  State<_SettingsSheet> createState() => _SettingsSheetState();
}

class _SettingsSheetState extends State<_SettingsSheet> {
  late Map<String, bool> _local;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _local = Map<String, bool>.from(widget.initial);
  }

  bool get _dirty =>
      widget.components.any((c) => _local[c.key] != widget.initial[c.key]);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final surfaceSubtle =
        isDark ? AppColors.darkSurface : AppColors.lightInk100;
    final semanticRed =
        isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

    return Container(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        top: 24,
        left: 24,
        right: 24,
      ),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.9,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkPageBg : AppColors.lightSurface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('总收入 A 的组成',
                style: TextStyle(color: ink900, fontSize: 18)),
            const SizedBox(height: 4),
            Text(
              'A = 勾选的进项之和 − 勾选的出项之和。字母按顺序静态分配，勾选不影响字母。',
              style: TextStyle(color: ink500, fontSize: 12),
            ),
            const SizedBox(height: 16),
            for (final group in const ['income', 'expense']) ...[
              Text(
                group == 'income' ? '进项（加入 A）' : '出项（从 A 减去）',
                style: TextStyle(color: ink500, fontSize: 11),
              ),
              const SizedBox(height: 6),
              ...widget.components
                  .where((c) =>
                      (group == 'income' ? c.sign == 1 : c.sign == -1))
                  .map((c) => _Row(
                        c: c,
                        value: _local[c.key] ?? c.enabled,
                        onChanged: (v) =>
                            setState(() => _local[c.key] = v),
                        ink500: ink500,
                        ink900: ink900,
                        surfaceSubtle: surfaceSubtle,
                        semanticRed: semanticRed,
                      )),
              const SizedBox(height: 12),
            ],
            if (!_local.values.any((v) => v))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  '至少启用一项，否则 A 将显示为 0。',
                  style: TextStyle(
                    color: isDark
                        ? AppColors.darkSemanticRed
                        : const Color(0xFFB45309),
                    fontSize: 11,
                  ),
                ),
              ),
            Row(
              children: [
                Expanded(
                  child: TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: TextButton.styleFrom(
                      backgroundColor: surfaceSubtle,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: Text('取消',
                        style: TextStyle(color: ink900, fontSize: 16)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextButton(
                    onPressed: _saving
                        ? null
                        : () async {
                            setState(() => _saving = true);
                            await widget.onSave(_local);
                            if (mounted) Navigator.of(context).pop();
                          },
                    style: TextButton.styleFrom(
                      backgroundColor: ink900,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: Text(
                      _saving ? '保存中…' : (_dirty ? '保存' : '完成'),
                      style: TextStyle(
                        color: isDark
                            ? AppColors.darkPageBg
                            : AppColors.lightSurface,
                        fontSize: 16,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final IncomeComponent c;
  final bool value;
  final ValueChanged<bool> onChanged;
  final Color ink500;
  final Color ink900;
  final Color surfaceSubtle;
  final Color semanticRed;

  const _Row({
    required this.c,
    required this.value,
    required this.onChanged,
    required this.ink500,
    required this.ink900,
    required this.surfaceSubtle,
    required this.semanticRed,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GestureDetector(
        onTap: () => onChanged(!value),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: surfaceSubtle,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: value ? ink900 : ink500,
                    width: 1.5,
                  ),
                  color: value ? ink900 : Colors.transparent,
                ),
                child: value
                    ? Icon(Icons.check,
                        size: 16,
                        color: isDark
                            ? AppColors.darkPageBg
                            : AppColors.lightSurface)
                    : null,
              ),
              const SizedBox(width: 12),
              Text(c.letter,
                  style: TextStyle(
                      color: ink500, fontSize: 14, fontWeight: FontWeight.w600)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(c.name,
                    style: TextStyle(color: ink900, fontSize: 14),
                    overflow: TextOverflow.ellipsis),
              ),
              Text(
                '${c.sign == -1 ? '−' : ''}${money.Money.formatPlain(c.cents)}',
                style: TextStyle(
                  color: c.sign == -1 ? semanticRed : ink500,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
