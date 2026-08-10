import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import '../../api/api_client.dart';
import '../../api/auth_api.dart';
import '../../data/db/database.dart';
import '../../theme/design_tokens.dart';

/// 首页「导出备份」：把全部本地业务数据导出为 JSON 文件（对齐网页端 ExportButton）。
///
/// 文件落在应用文档目录 `mab_backup_<时间戳>.json`。导出成功后展示文件路径。
Future<void> showExportSheet(BuildContext context) async {
  final messenger = ScaffoldMessenger.of(context);
  showDialog(
    context: context,
    barrierDismissible: false,
    builder: (_) => const AlertDialog(
      content: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2)),
          SizedBox(width: 12),
          Text('导出中…'),
        ],
      ),
    ),
  );
  try {
    final data = await AppDatabase.instance.exportAll();
    final dir = await getApplicationDocumentsDirectory();
    final ts = DateTime.now().toIso8601String().replaceAll(':', '-');
    final file = File('${dir.path}/mab_backup_$ts.json');
    final payload = {
      'app': 'myaccountbook',
      'version': 1,
      'exportedAt': DateTime.now().toIso8601String(),
      'data': data,
    };
    await file.writeAsString(jsonEncode(payload));
    if (context.mounted) Navigator.of(context).pop();
    if (context.mounted) {
      await showDialog(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('导出成功'),
          content: Text('备份已保存到：\n${file.path}'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('好'),
            ),
          ],
        ),
      );
    }
  } catch (e) {
    if (context.mounted) Navigator.of(context).pop();
    messenger.showSnackBar(SnackBar(content: Text('导出失败：$e')));
  }
}

/// 首页「导入还原」：列出文档目录下的备份文件，点选后整库还原（对齐网页端 ImportButton）。
///
/// [onImported] 在还原成功后回调，用于让首页重新拉取数据。还原前会二次确认。
Future<void> showImportSheet(
  BuildContext context, {
  required VoidCallback onImported,
}) async {
  final messenger = ScaffoldMessenger.of(context);
  late final Directory dir;
  late final List<File> files;
  try {
    dir = await getApplicationDocumentsDirectory();
    files = dir
        .listSync()
        .whereType<File>()
        .where((f) =>
            f.path.contains('mab_backup_') && f.path.endsWith('.json'))
        .toList()
      ..sort((a, b) => b.path.compareTo(a.path));
  } catch (e) {
    messenger.showSnackBar(SnackBar(content: Text('读取备份目录失败：$e')));
    return;
  }

  if (files.isEmpty) {
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('没有备份'),
        content: const Text('文档目录下没有找到 mab_backup_*.json 备份文件。'
            '请先「导出备份」生成文件。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('好'),
          ),
        ],
      ),
    );
    return;
  }

  if (!context.mounted) return;
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (_) => _ImportSheet(files: files, onImported: onImported),
  );
}

class _ImportSheet extends StatelessWidget {
  final List<File> files;
  final VoidCallback onImported;

  const _ImportSheet({required this.files, required this.onImported});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;

    return Container(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
      constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.8),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkPageBg : AppColors.lightSurface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('导入还原', style: TextStyle(color: ink900, fontSize: 18)),
          const SizedBox(height: 4),
          Text('选择一份备份整库还原（会覆盖当前本地数据）',
              style: TextStyle(color: ink500, fontSize: 12)),
          const SizedBox(height: 12),
          Flexible(
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: files.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final f = files[i];
                final name = f.path.split('/').last.split('\\').last;
                return ListTile(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  tileColor: isDark
                      ? AppColors.darkSurface
                      : AppColors.lightInk100,
                  title: Text(name,
                      style: TextStyle(color: ink900, fontSize: 14)),
                  trailing: Text('还原',
                      style: TextStyle(color: ink400, fontSize: 14)),
                  onTap: () => _confirmImport(context, f),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: TextButton(
              onPressed: () => Navigator.of(context).pop(),
              style: TextButton.styleFrom(
                backgroundColor:
                    isDark ? AppColors.darkSurface : AppColors.lightInk100,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: Text('取消',
                  style: TextStyle(color: ink900, fontSize: 16)),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmImport(BuildContext context, File file) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('确认还原？'),
        content: const Text('这会覆盖当前所有本地账本与记录，且不可撤销。'
            '确定要从该备份还原吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('确认还原'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    if (!context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    Navigator.of(context).pop(); // 关闭选择列表
    try {
      final raw = await file.readAsString();
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      final data = (decoded['data'] as Map<String, dynamic>).map(
        (k, v) => MapEntry(
          k,
          (v as List)
              .map((e) => Map<String, Object?>.from(e as Map))
              .toList(),
        ),
      );
      await AppDatabase.instance.importAll(data);
      onImported();
      messenger.showSnackBar(const SnackBar(content: Text('还原成功')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('还原失败：$e')));
    }
  }
}

/// 首页「修改密码」：当前密码 + 新密码 + 确认（对齐网页端 ChangePasswordButton）。
Future<void> showChangePasswordSheet(BuildContext context) async {
  final currentCtl = TextEditingController();
  final newCtl = TextEditingController();
  final confirmCtl = TextEditingController();
  final auth = AuthApi(ApiClient.instance);

  if (!context.mounted) return;
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (ctx) {
      return _ChangePasswordSheet(
        currentCtl: currentCtl,
        newCtl: newCtl,
        confirmCtl: confirmCtl,
        auth: auth,
      );
    },
  );
}

class _ChangePasswordSheet extends StatefulWidget {
  final TextEditingController currentCtl;
  final TextEditingController newCtl;
  final TextEditingController confirmCtl;
  final AuthApi auth;

  const _ChangePasswordSheet({
    required this.currentCtl,
    required this.newCtl,
    required this.confirmCtl,
    required this.auth,
  });

  @override
  State<_ChangePasswordSheet> createState() => _ChangePasswordSheetState();
}

class _ChangePasswordSheetState extends State<_ChangePasswordSheet> {
  String? _error;
  bool _busy = false;

  InputDecoration _decoration(String label, bool isDark) => InputDecoration(
        labelText: label,
        labelStyle: TextStyle(
            color: isDark ? AppColors.darkInk500 : AppColors.lightInk500,
            fontSize: 12),
        filled: true,
        fillColor: isDark
            ? AppColors.darkSurface
            : AppColors.lightInk100,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      );

  Future<void> _submit() async {
    setState(() {
      _error = null;
      if (widget.newCtl.text != widget.confirmCtl.text) {
        _error = '两次输入的新密码不一致';
        return;
      }
      if (widget.currentCtl.text.isEmpty || widget.newCtl.text.isEmpty) {
        _error = '请填写完整';
        return;
      }
      _busy = true;
    });
    try {
      await widget.auth.changePassword(
        widget.currentCtl.text,
        widget.newCtl.text,
      );
      if (mounted) {
        Navigator.of(context).pop();
        await showDialog(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('密码已修改'),
            content: const Text('其它设备上的登录已全部失效，需要重新登录。'
                '当前设备不受影响。'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('好'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;

    return Container(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        top: 24,
        left: 24,
        right: 24,
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
            Text('修改密码', style: TextStyle(color: ink900, fontSize: 18)),
            const SizedBox(height: 12),
            TextField(
              controller: widget.currentCtl,
              obscureText: true,
              autofillHints: const [AutofillHints.password],
              decoration: _decoration('当前密码', isDark),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: widget.newCtl,
              obscureText: true,
              autofillHints: const [AutofillHints.newPassword],
              decoration: _decoration('新密码（至少 8 位）', isDark),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: widget.confirmCtl,
              obscureText: true,
              autofillHints: const [AutofillHints.newPassword],
              decoration: _decoration('再输一次新密码', isDark),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!,
                  style: TextStyle(
                      color: isDark
                          ? AppColors.darkSemanticRed
                          : AppColors.lightSemanticRed,
                      fontSize: 13)),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: TextButton.styleFrom(
                      backgroundColor: isDark
                          ? AppColors.darkSurface
                          : AppColors.lightInk100,
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
                    onPressed: _busy ? null : _submit,
                    style: TextButton.styleFrom(
                      backgroundColor: ink900,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: Text(
                      _busy ? '提交中…' : '确认修改',
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
