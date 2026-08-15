import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../theme/design_tokens.dart';
import '../state/auth_state.dart';
import '../state/security_state.dart';
import '../security/biometric_service.dart';
import 'widgets/page_header.dart';
import 'widgets/app_card.dart';
import 'widgets/appearance_sheet.dart';
import 'home/backup_sheets.dart';
import 'home/onboarding_guide.dart';
import 'trash/trash_page.dart';
import 'users/users_page.dart';

/// 设置页（对齐网页端设置入口）。
///
/// 外观面板已抽离为 [AppearanceSheet]，本页只保留「入口行」：
/// 外观 / 导出备份 / 导入还原 / 修改密码 / 回收站 / 使用引导 / 用户管理(admin)，
/// 以及「指纹·面容锁」开关 [#5][#4]。
class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  bool _bioAvailable = false;

  @override
  void initState() {
    super.initState();
    BiometricService.canAuthenticate().then((v) {
      if (mounted) setState(() => _bioAvailable = v);
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final pageBg = isDark ? AppColors.darkPageBg : AppColors.lightPageBg;

    final auth = context.watch<AuthState>();
    final sec = context.watch<SecurityState>();

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
                subtitle: '外观 · 账户 · 数据 · 安全',
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
              const SizedBox(height: 16),
              AppCard(
                child: Column(
                  children: [
                    _SettingRow(
                      icon: '🗑️',
                      label: '回收站',
                      subtitle: '删除的记录 · 60 天内可恢复',
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const TrashPage()),
                      ),
                    ),
                    Divider(height: 1, thickness: 1, color: border),
                    _SettingRow(
                      icon: '🧭',
                      label: '使用引导',
                      subtitle: '功能速览 · 新手第一步',
                      onTap: () => OnboardingGuide.show(context),
                    ),
                    if (auth.role == 'admin') ...[
                      Divider(height: 1, thickness: 1, color: border),
                      _SettingRow(
                        icon: '👥',
                        label: '用户管理',
                        subtitle: '管理员专属：新增/删除/重置用户',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const UsersPage()),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),
              AppCard(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text('🔒', style: TextStyle(color: ink900, fontSize: 18)),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('指纹 / 面容登录',
                                    style: TextStyle(
                                        color: ink900,
                                        fontSize: 15,
                                        fontWeight: FontWeight.w600)),
                                const SizedBox(height: 2),
                                Text(
                                    '用指纹/面容替代密码登录 app；登录后切前台会重新上锁',
                                    style: TextStyle(color: ink500, fontSize: 13)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _BioLockSelector(
                        mode: sec.mode,
                        available: _bioAvailable,
                        onChanged: (m) => sec.setMode(m),
                      ),
                      if (!_bioAvailable)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                              '本设备未启用指纹/面容，开启后也无法验证',
                              style: TextStyle(
                                  color: isDark
                                      ? AppColors.darkSemanticRed
                                      : AppColors.lightSemanticRed,
                                  fontSize: 12)),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 生物识别作用范围的二选一分段控件。
class _BioLockSelector extends StatelessWidget {
  final BioLockMode mode;
  final bool available;
  final ValueChanged<BioLockMode> onChanged;

  const _BioLockSelector({
    required this.mode,
    required this.available,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final fill = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final textOn = isDark ? AppColors.darkCtaText : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;

    Widget chip(String label, BioLockMode value) {
      final selected = mode == value;
      return Expanded(
        child: InkWell(
          onTap: available || value == BioLockMode.off
              ? () => onChanged(value)
              : null,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
            decoration: BoxDecoration(
              color: selected ? fill : Colors.transparent,
              border: Border.all(color: selected ? fill : border),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: Text(label,
                  style: TextStyle(
                      color: selected ? textOn : ink900, fontSize: 14)),
            ),
          ),
        ),
      );
    }

    return Row(children: [
      chip('关闭', BioLockMode.off),
      const SizedBox(width: 8),
      chip('指纹/面容登录', BioLockMode.login),
    ]);
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
