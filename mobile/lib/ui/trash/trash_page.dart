import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/design_tokens.dart';
import '../../state/theme_state.dart';
import '../../data/local/general_entry_dao.dart';
import '../../data/local/ledger_dao.dart';
import '../../data/models/general_entry.dart';
import '../widgets/app_card.dart';
import '../widgets/money.dart';
import '../widgets/page_header.dart';

/// 回收站页（设计 2:135 / 网页 src/app/trash）。
///
/// 本地优先：直接读 [GeneralEntryDao.listDeleted] 软删条目，恢复 / 彻底删除
/// 走 [GeneralEntryDao.restore] / [GeneralEntryDao.hardDelete]。无新依赖。
class TrashPage extends StatefulWidget {
  const TrashPage({super.key});

  @override
  State<TrashPage> createState() => _TrashPageState();
}

class _TrashPageState extends State<TrashPage> {
  final List<GeneralEntry> _items = [];
  final Map<String, String> _ledgerNames = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final deleted = await GeneralEntryDao().listDeleted();
    final ledgers = await LedgerDao().listAllIncludingDeleted();
    _ledgerNames.clear();
    for (final l in ledgers) _ledgerNames[l.id] = l.name;
    if (!mounted) return;
    _items
      ..clear()
      ..addAll(deleted);
    _loading = false;
    setState(() {});
  }

  Future<void> _restore(GeneralEntry e) async {
    await GeneralEntryDao().restore(e.id);
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('已恢复')));
    await _load();
  }

  Future<void> _purge(GeneralEntry e) async {
    final ok = await _confirm(
      context,
      title: '永久删除「${e.note ?? e.category}」？',
      body: '这一步不可撤销，立刻从本地数据库抹掉，无法找回。',
      confirmText: '彻底删除',
    );
    if (!ok || !mounted) return;
    await GeneralEntryDao().hardDelete(e.id);
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('已永久删除')));
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    context.watch<ThemeState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;

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
                  icon: '🗑️',
                  title: '回收站',
                  subtitle: '删除的记账条目 · 60 天内可恢复',
                ),
                Text(
                  '删除的记账条目保留 60 天，之后自动清理。恢复即回到原账本；'
                  '彻底删除则立刻抹掉，无法找回。整个账本的回收站在「账本」里。',
                  style: TextStyle(color: ink500, fontSize: 13),
                ),
                const SizedBox(height: 16),
                if (_loading)
                  _hint('加载中…', ink400)
                else if (_items.isEmpty)
                  _hint('回收站是空的', ink500)
                else
                  ..._items.map(
                    (e) => _TrashTile(
                      entry: e,
                      ledgerName: _ledgerNames[e.ledgerId],
                      ink900: ink900,
                      ink500: ink500,
                      ink400: ink400,
                      red: red,
                      onRestore: _restore,
                      onPurge: _purge,
                    ),
                  ),
                const SizedBox(height: 16),
                Text(
                  '删除的记录会在 60 天后自动清除，期间可随时恢复。',
                  style: TextStyle(color: ink400, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TrashTile extends StatelessWidget {
  final GeneralEntry entry;
  final String? ledgerName;
  final Color ink900;
  final Color ink500;
  final Color ink400;
  final Color red;
  final Future<void> Function(GeneralEntry) onRestore;
  final Future<void> Function(GeneralEntry) onPurge;

  const _TrashTile({
    required this.entry,
    this.ledgerName,
    required this.ink900,
    required this.ink500,
    required this.ink400,
    required this.red,
    required this.onRestore,
    required this.onPurge,
  });

  @override
  Widget build(BuildContext context) {
    final days = _daysLeft(entry.deletedAt);
    final title = (entry.note != null && entry.note!.isNotEmpty)
        ? entry.note!
        : entry.category;
    final direction = entry.direction == 'income' ? '收入' : '支出';
    final contextLabel = ledgerName != null ? ' · $ledgerName' : '';

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
                  Expanded(
                    child: Text(title,
                        style: TextStyle(color: ink900, fontSize: 15)),
                  ),
                  Money(cents: entry.amountCents),
                ],
              ),
              const SizedBox(height: 4),
              Text('$direction$contextLabel',
                  style: TextStyle(color: ink500, fontSize: 13)),
              const SizedBox(height: 4),
              Text(
                days > 0 ? '还剩 $days 天自动清除' : '即将清除',
                style: TextStyle(color: ink400, fontSize: 13),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  GestureDetector(
                    onTap: () => onRestore(entry),
                    child:
                        Text('恢复', style: TextStyle(color: ink500, fontSize: 13)),
                  ),
                  const SizedBox(width: 16),
                  GestureDetector(
                    onTap: () => onPurge(entry),
                    child: Text('彻底删除',
                        style: TextStyle(color: red, fontSize: 13)),
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

/// 删除时间戳 → 距 60 天保留期结束的剩余天数（对齐网页 RETENTION_DAYS=60）。
int _daysLeft(int? deletedAt) {
  if (deletedAt == null) return 60;
  const retention = 60 * 24 * 60 * 60 * 1000;
  final cutoff = deletedAt + retention;
  final ms = cutoff - DateTime.now().millisecondsSinceEpoch;
  return ms <= 0 ? 0 : (ms / (24 * 60 * 60 * 1000)).ceil();
}

Widget _hint(String text, Color color) => Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text(text, style: TextStyle(color: color, fontSize: 13)),
    );

/// 危险操作二次确认对话框（danger 文字用语义红）。
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
