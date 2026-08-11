import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../theme/design_tokens.dart';

/// 新用户「使用引导」弹窗（对齐网页端 src/components/OnboardingGuide.tsx）。
///
/// 网页端在注册成功后带 `?welcome=1` 时落地页自动弹出；本地无该 query 信号，
/// 改为「首次启动自动弹出一次」+ 首页「使用引导」入口卡片可手动重开，二者共用
/// 同一个 SharedPreferences 标记，保证只自动弹一次。
class OnboardingGuide {
  OnboardingGuide._();

  static const String _kSeen = 'onboarding_seen_v1';

  /// 首次启动自动弹出（对齐网页端 `?welcome=1`）。已看过则无操作。
  /// 返回是否真正弹出了弹窗。
  static Future<bool> maybeShowOnFirstLaunch(BuildContext context) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool(_kSeen) == true) return false;
    } catch (_) {
      return false;
    }
    if (!context.mounted) return false;
    await show(context);
    return true;
  }

  /// 手动打开（首页「使用引导」入口卡片）。不看标记，直接弹并记录已看过。
  static Future<void> show(BuildContext context) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_kSeen, true);
    } catch (_) {
      // 忽略持久化失败，不影响弹窗展示。
    }
    if (!context.mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _OnboardingSheet(),
    );
  }
}

class _OnboardingSheet extends StatelessWidget {
  const _OnboardingSheet();

  static const List<_Feature> _features = [
    _Feature(icon: '📒', title: '普通账本', desc: '日常收支随手记，按月 / 类别统计，还能看环比同比趋势。'),
    _Feature(icon: '💼', title: '工作账本', desc: '记录工作进项与出项，月底一眼看清回款与垫付。'),
    _Feature(icon: '🌸', title: '桃源账本', desc: '把活动奖金、奖励发给大家，流程清晰可追踪。'),
    _Feature(icon: '✈️', title: '旅游账本', desc: '和朋友一起记，自动算 AA 分摊与最优结算，还能生成只读分享页。'),
    _Feature(icon: '🔁', title: '周期记账', desc: '房租、订阅、工资，配一次自动记，告别重复手填。'),
    _Feature(icon: '📈', title: '统计', desc: '月度趋势、类别占比、收入支出对比，账本全貌一目了然。'),
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final fill = isDark ? AppColors.darkPageBg : AppColors.lightSurface;

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
        color: fill,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const Text('🎉', style: TextStyle(fontSize: 36)),
            const SizedBox(height: 8),
            Text('欢迎使用 心愿便利贴',
                style: TextStyle(
                    color: ink900, fontSize: 20, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text('一款帮你把每一笔账记清楚的小工具。下面是它能做的事，挑几样先试试就好。',
                style: TextStyle(color: ink500, fontSize: 12),
                textAlign: TextAlign.center),
            const SizedBox(height: 20),
            ..._features.map((f) => _FeatureRow(
                  f: f,
                  ink900: ink900,
                  ink500: ink500,
                )),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                style: TextButton.styleFrom(
                  backgroundColor: ink900,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: Text('开始使用',
                    style: TextStyle(
                      color: isDark
                          ? AppColors.darkPageBg
                          : AppColors.lightSurface,
                      fontSize: 16,
                    )),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _Feature {
  final String icon;
  final String title;
  final String desc;
  const _Feature(
      {required this.icon, required this.title, required this.desc});
}

class _FeatureRow extends StatelessWidget {
  final _Feature f;
  final Color ink900;
  final Color ink500;

  const _FeatureRow({
    required this.f,
    required this.ink900,
    required this.ink500,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final subtle = isDark ? AppColors.darkSurface : AppColors.lightInk100;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: subtle,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border, width: 1),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(f.icon, style: const TextStyle(fontSize: 22)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(f.title,
                    style: TextStyle(
                        color: ink900,
                        fontSize: 14,
                        fontWeight: FontWeight.w500)),
                const SizedBox(height: 2),
                Text(f.desc,
                    style: TextStyle(color: ink500, fontSize: 12),
                    softWrap: true),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
