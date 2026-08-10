import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../theme/design_tokens.dart';
import '../../state/theme_state.dart';
import '../../data/local/ledger_dao.dart';
import '../../data/models/ledger.dart';
import '../widgets/app_card.dart';
import '../widgets/app_primary_button.dart';
import '../widgets/page_header.dart';

/// 账本管理页（设计 2:136 / 网页 src/app/ledgers）。
///
/// 本地优先：直接读 [LedgerDao.listAllIncludingDeleted]，软删 / 彻底删除 /
/// 新建均走 [LedgerDao]（恢复用 [LedgerDao.upsert] 清 deleted_at）。无新依赖。
class ManageLedgersPage extends StatefulWidget {
  const ManageLedgersPage({super.key});

  @override
  State<ManageLedgersPage> createState() => _ManageLedgersPageState();
}

class _ManageLedgersPageState extends State<ManageLedgersPage> {
  final List<Ledger> _all = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final list = await LedgerDao().listAllIncludingDeleted();
    if (!mounted) return;
    _all
      ..clear()
      ..addAll(list);
    _loading = false;
    setState(() {});
  }

  Future<void> _softDelete(Ledger l) async {
    final ok = await _confirm(
      context,
      title: '把「${l.name}」放入回收站？',
      body: '首页不再显示。60 天内可恢复；恢复后原有数据完整保留。',
      confirmText: '放入回收站',
    );
    if (!ok || !mounted) return;
    await LedgerDao().softDelete(l.id);
    await _load();
  }

  Future<void> _restore(Ledger l) async {
    await LedgerDao().upsert(l.copyWith(deletedAt: null, synced: 0));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('已恢复')));
    await _load();
  }

  Future<void> _purge(Ledger l) async {
    final ok = await _confirm(
      context,
      title: '永久删除「${l.name}」？',
      body: '该账本所有记录会立即一并销毁，此操作不可恢复！',
      confirmText: '永久删除',
    );
    if (!ok || !mounted) return;
    await LedgerDao().delete(l.id);
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('已永久删除')));
    await _load();
  }

  Future<void> _createFromPreset(String title, String icon, String kind) async {
    final maxOrder = _all.isEmpty
        ? 0
        : _all.map((l) => l.order).reduce((a, b) => a > b ? a : b);
    final ledger = Ledger(
      id: const Uuid().v4(),
      kind: kind,
      name: title,
      icon: icon,
      order: maxOrder + 1,
      synced: 0,
    );
    await LedgerDao().upsert(ledger);
  }

  @override
  Widget build(BuildContext context) {
    context.watch<ThemeState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final headColor = isDark ? AppColors.darkInk500 : AppColors.lightInk700;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final green = isDark ? AppColors.darkSemanticGreen : AppColors.lightSemanticGreen;

    final active = _all.where((l) => l.deletedAt == null).toList();
    final recycled = _all.where((l) => l.deletedAt != null).toList();

    const presets = <({String title, String icon, String kind})>[
      (title: '普通账本', icon: '📒', kind: 'general'),
      (title: '工作账本', icon: '💼', kind: 'work'),
      (title: '桃源账本', icon: '🌸', kind: 'taoyuan'),
      (title: '旅游账本', icon: '✈️', kind: 'travel'),
    ];

    return Scaffold(
      body: Container(
        color: pageBg,
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const PageHeader(
                  icon: '📚',
                  title: '账本',
                  subtitle: '添加 / 删除账本 · 回收站',
                ),

                // ① 我的账本
                _sectionTitle('我的账本', '${active.length} 个', headColor, ink400),
                const SizedBox(height: 8),
                if (_loading)
                  _hint('加载中…', ink400)
                else if (active.isEmpty)
                  _hint('还没有账本，从下方添加一个', ink500)
                else
                  ...active.map(
                    (l) => _LedgerTile(
                      ledger: l,
                      ink900: ink900,
                      ink500: ink500,
                      red: red,
                      onDelete: _softDelete,
                    ),
                  ),

                const SizedBox(height: 16),

                // ② 添加账本
                _sectionTitle('添加账本', null, headColor, ink400),
                const SizedBox(height: 8),
                AppPrimaryButton(
                  label: '＋ 添加账本',
                  onPressed: () => showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    builder: (_) => _PresetSheet(
                      presets: presets,
                      onPick: _createFromPreset,
                    ),
                  ).then((_) {
                    if (mounted) _load();
                  }),
                ),

                const SizedBox(height: 16),

                // ③ 回收站
                _sectionTitle(
                  '回收站',
                  recycled.isEmpty
                      ? '空'
                      : '${recycled.length} 个 · 60 天后自动清空',
                  headColor,
                  ink400,
                ),
                const SizedBox(height: 8),
                if (recycled.isEmpty)
                  _hint('回收站是空的', ink500)
                else
                  ...recycled.map(
                    (l) => _RecycledTile(
                      ledger: l,
                      ink400: ink400,
                      ink500: ink500,
                      red: red,
                      green: green,
                      onRestore: _restore,
                      onPurge: _purge,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Widget _sectionTitle(String label, String? trailing, Color head, Color sub) =>
    Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: TextStyle(color: head, fontSize: 15, fontWeight: FontWeight.w600)),
        if (trailing != null)
          Text(trailing, style: TextStyle(color: sub, fontSize: 12)),
      ],
    );

Widget _hint(String text, Color color) => Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text(text, style: TextStyle(color: color, fontSize: 13)),
    );

String _kindLabel(String kind) {
  switch (kind) {
    case 'work':
      return '工作';
    case 'taoyuan':
      return '桃源';
    case 'general':
      return '普通';
    case 'travel':
      return '旅游';
    default:
      return kind;
  }
}

int _daysLeft(int? deletedAt) {
  if (deletedAt == null) return 60;
  const retention = 60 * 24 * 60 * 60 * 1000;
  final cutoff = deletedAt + retention;
  final ms = cutoff - DateTime.now().millisecondsSinceEpoch;
  return ms <= 0 ? 0 : (ms / (24 * 60 * 60 * 1000)).ceil();
}

class _LedgerTile extends StatelessWidget {
  final Ledger ledger;
  final Color ink900;
  final Color ink500;
  final Color red;
  final Future<void> Function(Ledger) onDelete;

  const _LedgerTile({
    required this.ledger,
    required this.ink900,
    required this.ink500,
    required this.red,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: AppCard(
          frosted: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Text(ledger.icon ?? '📒',
                    style: TextStyle(fontSize: 24, color: ink900)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ledger.name,
                          style: TextStyle(color: ink900, fontSize: 15)),
                      const SizedBox(height: 2),
                      Text(_kindLabel(ledger.kind),
                          style: TextStyle(color: ink500, fontSize: 13)),
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () => onDelete(ledger),
                  child: Text('删除',
                      style: TextStyle(color: red, fontSize: 13)),
                ),
              ],
            ),
          ),
        ),
      );
}

class _RecycledTile extends StatelessWidget {
  final Ledger ledger;
  final Color ink400;
  final Color ink500;
  final Color red;
  final Color green;
  final Future<void> Function(Ledger) onRestore;
  final Future<void> Function(Ledger) onPurge;

  const _RecycledTile({
    required this.ledger,
    required this.ink400,
    required this.ink500,
    required this.red,
    required this.green,
    required this.onRestore,
    required this.onPurge,
  });

  @override
  Widget build(BuildContext context) {
    final days = _daysLeft(ledger.deletedAt);
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
                children: [
                  Text(ledger.icon ?? '📒',
                      style: TextStyle(fontSize: 24, color: ink400)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          ledger.name,
                          style: TextStyle(
                            color: ink400,
                            fontSize: 15,
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${_kindLabel(ledger.kind)} · '
                          '${days > 0 ? '还有 $days 天自动清除' : '即将清除'}',
                          style: TextStyle(color: ink500, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _ActionButton(
                      label: '恢复',
                      color: green,
                      onTap: () => onRestore(ledger),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _ActionButton(
                      label: '永久删除',
                      color: red,
                      onTap: () => onPurge(ledger),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _ActionButton({
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            border: Border.all(color: color.withOpacity(0.4)),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Text(label,
                style: TextStyle(color: color, fontSize: 13)),
          ),
        ),
      );
}

class _PresetSheet extends StatelessWidget {
  final List<({String title, String icon, String kind})> presets;
  final Future<void> Function(String, String, String) onPick;

  const _PresetSheet({required this.presets, required this.onPick});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

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
          const Text('添加账本',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          ...presets.map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: AppCard(
                frosted: false,
                onTap: () async {
                  await onPick(p.title, p.icon, p.kind);
                  if (context.mounted) Navigator.of(context).pop();
                },
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Text(p.icon, style: const TextStyle(fontSize: 24)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(p.title,
                            style: TextStyle(color: ink900, fontSize: 15)),
                      ),
                      Text('›',
                          style: TextStyle(color: ink500, fontSize: 20)),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

Future<bool> _confirm(
  BuildContext context, {
  required String title,
  required String body,
  String confirmText = '确认',
}) async {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('取消'),
        ),
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(confirmText, style: TextStyle(color: red)),
        ),
      ],
    ),
  );
  return confirmed ?? false;
}
