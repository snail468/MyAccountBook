import 'package:flutter/material.dart';
import '../theme/design_tokens.dart';
import 'widgets/page_header.dart';
import 'widgets/app_card.dart';
import 'widgets/appearance_sheet.dart';
import 'home/backup_sheets.dart';

/// 设置页（对齐网页端设置入口）。
///
/// 外观面板已抽离为 [AppearanceSheet]，本页只保留「入口行」：
/// 外观 / 导出备份 / 导入还原 / 修改密码，逐行点开对应面板。
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;

    return Scaffold(
      backgroundColor: pageBg,
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const PageHeader(
                icon: '🛠️',
                title: '设置',
                subtitle: '外观 · 账户 · 数据',
              ),
              AppCard(
                child: Column(
                  children: [
                    _SettingRow(
                      icon: '🎨',
                      label: '外观',
                      subtitle: '主题 · 字号 · 点击光效 · 音效',
                      onTap: () async {
                        await showModalBottomSheet(
                          context: context,
                          isScrollControlled: true,
                          builder: (_) => const AppearanceSheet(),
                        );
                      },
                    ),
                    Divider(height: 1, thickness: 1, color: border),
                    _SettingRow(
                      icon: '📤',
                      label: '导出备份',
                      subtitle: '全部账本 · CSV 查看 / JSON 完整还原',
                      onTap: () async {
                        await showExportSheet(context);
                      },
                    ),
                    Divider(height: 1, thickness: 1, color: border),
                    _SettingRow(
                      icon: '📥',
                      label: '导入还原',
                      subtitle: '从完整备份 JSON 恢复数据',
                      onTap: () async {
                        await showImportSheet(context, onImported: () {});
                      },
                    ),
                    Divider(height: 1, thickness: 1, color: border),
                    _SettingRow(
                      icon: '🔑',
                      label: '修改密码',
                      subtitle: '改完会让其它设备重新登录',
                      onTap: () async {
                        await showChangePasswordSheet(context);
                      },
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 设置行：图标 + 标题 + 副标题 + 右侧箭头，整行可点。
class _SettingRow extends StatelessWidget {
  final String icon;
  final String label;
  final String subtitle;
  final VoidCallback onTap;

  const _SettingRow({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: surface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(icon, style: const TextStyle(fontSize: 20)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: TextStyle(
                          color: ink900,
                          fontSize: 15,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: TextStyle(color: ink500, fontSize: 13)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: ink400, size: 20),
          ],
        ),
      ),
    );
  }
}
