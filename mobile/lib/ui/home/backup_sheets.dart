import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import '../../api/api_client.dart';
import '../../api/auth_api.dart';
import '../../data/db/database.dart';
import '../../theme/design_tokens.dart';

/// 首页「导出备份」：可选导出 JSON（完整备份，可还原）或 CSV（Excel 可打开）。
///
/// 先选格式，再弹系统保存对话框自定义保存路径/文件名。
Future<void> showExportSheet(BuildContext context) async {
  final messenger = ScaffoldMessenger.of(context);
  final fmt = await _pickExportFormat(context);
  if (fmt == null || !context.mounted) return;

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
    final String content;
    final String ext;
    if (fmt == 'csv') {
      // CSV 走服务端 /api/export（与网页端同一套分区逻辑，在线）。
      content = await ApiClient.instance.getText('/export');
      ext = 'csv';
    } else {
      final data = await AppDatabase.instance.exportAll();
      final payload = {
        'app': 'myaccountbook',
        'version': 1,
        'exportedAt': DateTime.now().toIso8601String(),
        'data': data,
      };
      content = jsonEncode(payload);
      ext = 'json';
    }

    if (context.mounted) Navigator.of(context).pop();

    final ts = DateTime.now().toIso8601String().replaceAll(':', '-');
    final path = await FilePicker.platform.saveFile(
      dialogTitle: ext == 'csv' ? '保存 CSV 备份' : '保存 JSON 备份',
      fileName: 'mab_backup_$ts.$ext',
      type: FileType.custom,
      allowedExtensions: [ext],
      bytes: utf8.encode(content),
    );

    if (!context.mounted) return;
    if (path == null) {
      messenger.showSnackBar(const SnackBar(content: Text('已取消导出')));
      return;
    }
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('导出成功'),
        content: Text('备份已保存到：\n$path'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('好'),
          ),
        ],
      ),
    );
  } catch (e) {
    if (context.mounted) Navigator.of(context).pop();
    messenger.showSnackBar(SnackBar(content: Text('导出失败：$e')));
  }
}

/// 选择导出格式：返回 'json' / 'csv'，null 表示取消。
Future<String?> _pickExportFormat(BuildContext context) {
  return showModalBottomSheet<String>(
    context: context,
    builder: (ctx) {
      final isDark = Theme.of(ctx).brightness == Brightness.dark;
      final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
      final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
      final tile = isDark ? AppColors.darkSurface : AppColors.lightInk100;
      Widget option(String label, String sub, String value) => ListTile(
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
            tileColor: tile,
            title: Text(label,
                style: TextStyle(color: ink900, fontSize: 14)),
            subtitle:
                Text(sub, style: TextStyle(color: ink500, fontSize: 12)),
            trailing: Icon(Icons.chevron_right, color: ink500),
            onTap: () => Navigator.of(ctx).pop(value),
          );
      return Container(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkPageBg : AppColors.lightSurface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('导出备份', style: TextStyle(color: ink900, fontSize: 18)),
            const SizedBox(height: 4),
            Text('选择导出格式', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 12),
            option('JSON（完整备份，可还原）', '含全部账本与记录，用于导入还原', 'json'),
            const SizedBox(height: 8),
            option('CSV（Excel 可打开）', '适合查看/表格分析，不可用于还原', 'csv'),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                style: TextButton.styleFrom(
                  backgroundColor: tile,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child:
                    Text('取消', style: TextStyle(color: ink900, fontSize: 16)),
              ),
            ),
          ],
        ),
      );
    },
  );
}

/// 首页「导入还原」：从文件浏览器选 json 文件（或从文档目录历史备份）整库还原。
///
/// [onImported] 在还原成功后回调，用于让首页重新拉取数据。还原前会二次确认。
Future<void> showImportSheet(
  BuildContext context, {
  required VoidCallback onImported,
}) async {
  if (!context.mounted) return;
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (_) => _ImportSheet(onImported: onImported),
  );
}

class _ImportSheet extends StatefulWidget {
  final VoidCallback onImported;

  const _ImportSheet({required this.onImported});

  @override
  State<_ImportSheet> createState() => _ImportSheetState();
}

class _ImportSheetState extends State<_ImportSheet> {
  List<File> _files = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadDir();
  }

  Future<void> _loadDir() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final files = dir
          .listSync()
          .whereType<File>()
          .where((f) =>
              f.path.contains('mab_backup_') && f.path.endsWith('.json'))
          .toList()
        ..sort((a, b) => b.path.compareTo(a.path));
      if (mounted) {
        setState(() {
          _files = files;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// 从文件浏览器选 json 文件。
  Future<void> _pickFromBrowser() async {
    final result = await FilePicker.platform.pickFiles(
      dialogTitle: '选择 JSON 备份文件',
      type: FileType.custom,
      allowedExtensions: ['json'],
    );
    if (result == null || result.files.isEmpty || !mounted) return;
    final f = result.files.single;
    String? raw;
    if (f.path != null) {
      raw = await File(f.path!).readAsString();
    } else if (f.bytes != null) {
      raw = utf8.decode(f.bytes!);
    }
    if (raw == null || !mounted) return;
    await _confirmAndImport(raw);
  }

  Future<void> _confirmAndImport(String raw) async {
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
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    Navigator.of(context).pop(); // 关闭底部 sheet
    try {
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
      widget.onImported();
      messenger.showSnackBar(const SnackBar(content: Text('还原成功')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('还原失败：$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final tile = isDark ? AppColors.darkSurface : AppColors.lightInk100;
    final onFill = isDark ? AppColors.darkPageBg : AppColors.lightSurface;

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
          Text('从文件浏览器选 json 文件，或从历史备份中选择（会覆盖当前本地数据）',
              style: TextStyle(color: ink500, fontSize: 12)),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: TextButton(
              onPressed: _pickFromBrowser,
              style: TextButton.styleFrom(
                backgroundColor: ink900,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: Text('从文件浏览器选择 JSON 文件',
                  style: TextStyle(color: onFill, fontSize: 16)),
            ),
          ),
          const SizedBox(height: 12),
          if (_loading)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text('读取历史备份…',
                  style: TextStyle(color: ink500, fontSize: 12)),
            )
          else if (_files.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text('文档目录下暂无历史备份',
                  style: TextStyle(color: ink500, fontSize: 12)),
            )
          else ...[
            Text('历史备份', style: TextStyle(color: ink500, fontSize: 12)),
            const SizedBox(height: 6),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: _files.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final f = _files[i];
                  final name = f.path.split('/').last.split('\\').last;
                  return ListTile(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    tileColor: tile,
                    title: Text(name,
                        style: TextStyle(color: ink900, fontSize: 14)),
                    trailing: Text('还原',
                        style: TextStyle(color: ink400, fontSize: 14)),
                    onTap: () async {
                      final raw = await f.readAsString();
                      if (mounted) await _confirmAndImport(raw);
                    },
                  );
                },
              ),
            ),
          ],
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: TextButton(
              onPressed: () => Navigator.of(context).pop(),
              style: TextButton.styleFrom(
                backgroundColor: tile,
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
              decoration: _decoration('新密码（至少 8 位，别用连续数字或常见弱口令）', isDark),
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
