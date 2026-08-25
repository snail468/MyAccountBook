import 'package:flutter/material.dart';

import '../../core/general_categories.dart' show iconLibrary;
import '../../theme/design_tokens.dart';

/// 全量 emoji 选择底部弹层（对齐网页端 AddCategoryModal 的图标库网格）。
///
/// 按 [iconLibrary] 的分组渲染，点击某个 emoji 即返回该 emoji（关闭弹层）。
/// [selected] 为当前已选，用于高亮。用于：普通账本新增自定义类别的图标、
/// 旅游账本图标等所有「需要选 emoji」的入口，避免手动输入。[#1]
Future<String?> showEmojiPicker(
  BuildContext context, {
  String? selected,
  String title = '选择图标',
}) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => _EmojiPickerSheet(selected: selected, title: title),
  );
}

class _EmojiPickerSheet extends StatelessWidget {
  final String? selected;
  final String title;
  const _EmojiPickerSheet({required this.selected, required this.title});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final subtle = isDark ? AppColors.darkSurface : AppColors.lightSurfaceSubtle;
    final tileBg = isDark ? AppColors.darkPageBg : AppColors.lightSurface;
    final selBg = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(title,
                    style: TextStyle(
                        color: ink900,
                        fontSize: 18,
                        fontWeight: FontWeight.w700)),
                const Spacer(),
                if (selected != null && selected!.isNotEmpty)
                  Text('当前 $selected',
                      style: TextStyle(color: ink500, fontSize: 14)),
              ],
            ),
            const SizedBox(height: 12),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final g in iconLibrary) ...[
                      Text(g.group,
                          style: TextStyle(color: ink500, fontSize: 11)),
                      const SizedBox(height: 6),
                      Container(
                        decoration: BoxDecoration(
                          color: subtle,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.all(6),
                        child: Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            for (final emo in g.icons)
                              InkWell(
                                borderRadius: BorderRadius.circular(10),
                                onTap: () => Navigator.of(context).pop(emo),
                                child: Container(
                                  width: 40,
                                  height: 40,
                                  decoration: BoxDecoration(
                                    color: emo == selected ? selBg : tileBg,
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(color: border, width: 1),
                                  ),
                                  alignment: Alignment.center,
                                  child: Text(emo,
                                      style: const TextStyle(fontSize: 20)),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
