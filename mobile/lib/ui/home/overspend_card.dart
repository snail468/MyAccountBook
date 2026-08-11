import 'package:flutter/material.dart';
import '../../theme/design_tokens.dart';

/// 超支账本（对齐网页端首页红色「分类预算超支」卡片里的单个 ledger）。
class OverLedger {
  final String ledgerId;
  final String ledgerName;
  final int overCount;

  const OverLedger({
    required this.ledgerId,
    required this.ledgerName,
    required this.overCount,
  });
}

/// 首页「分类预算超支」红色卡片（对齐网页端 src/app/page.tsx 的 overLedgers 区块）。
///
/// 仅在有超支账本时渲染（web 用 `s.overLedgers.length > 0` 守卫）。
/// 每个超支账本是独立可点行，跳转对应账本页（web 里是 /l/[id] 的 Link）。
/// 固定红底、不磨砂，确保警示色不被玻璃主题冲淡。
class OverspendCard extends StatelessWidget {
  final List<OverLedger> overLedgers;
  final void Function(String ledgerId)? onTap;

  const OverspendCard({super.key, required this.overLedgers, this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? AppColors.darkOverspendBg : AppColors.lightOverspendBg;
    final border =
        isDark ? AppColors.darkOverspendBorder : AppColors.lightOverspendBorder;
    final titleColor =
        isDark ? AppColors.darkOverspendTitle : AppColors.lightOverspendTitle;
    final detailColor =
        isDark ? AppColors.darkOverspendDetail : AppColors.lightOverspendDetail;

    return Container(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: border, width: 1),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('⚠️ 分类预算超支',
              style: TextStyle(
                  color: titleColor,
                  fontSize: 12,
                  fontWeight: FontWeight.w500)),
          const SizedBox(height: 6),
          ...overLedgers.map((o) => InkWell(
                onTap: o.ledgerId.isNotEmpty
                    ? () => onTap?.call(o.ledgerId)
                    : null,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(o.ledgerName,
                            style: TextStyle(color: detailColor, fontSize: 14),
                            overflow: TextOverflow.ellipsis),
                      ),
                      Text('${o.overCount} 项超支 ›',
                          style: TextStyle(
                              color: detailColor, fontSize: 11)),
                    ],
                  ),
                ),
              )),
        ],
      ),
    );
  }
}
