import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../data/models/ledger.dart';
import '../../state/ledger_list_state.dart';
import '../../theme/app_theme.dart';
import '../../theme/design_tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/page_header.dart';

/// 账本管理页（设计 2:136）。
///
/// 直接复用根级注入的 [LedgerListState]（single source of truth），
/// 删除 / 新建会即时反映到首页网格（首页读取 [LedgerListState.all]）。
class ManageLedgersPage extends StatelessWidget {
  const ManageLedgersPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: const _Body(),
    );
  }
}

/// kind -> 中文标签。
String _kindLabel(String kind) {
  switch (kind) {
    case 'work':
      return '工作';
    case 'taoyuan':
      return '桃源';
    case 'general':
      return '普通';
    case 'travel':
      return '旅行';
    default:
      return kind;
  }
}

class _Body extends StatelessWidget {
  const _Body();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<LedgerListState>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final headColor = isDark ? AppColors.darkInk500 : AppColors.lightInk700;
    final red = AppColors.lightSemanticRed;
    final green = AppColors.lightSemanticGreen;

    final all = state.allIncludingDeleted;
    final active = all.where((l) => l.deletedAt == null).toList();
    final recycled = all.where((l) => l.deletedAt != null).toList();

    // 预设模板：严格对齐网页端 PresetPicker（工作/桃源/普通/旅游/自定义）。
    const templates = [
      (title: '工作账本', icon: '💼', kind: 'work'),
      (title: '桃源账本', icon: '🌸', kind: 'taoyuan'),
      (title: '普通账本', icon: '📒', kind: 'general'),
      (title: '旅游账本', icon: '✈️', kind: 'travel'),
      (title: '自定义账本', icon: '📝', kind: 'general'),
    ];

    void createFromTemplate(String title, String icon, String kind) {
      final maxOrder = all.isEmpty
          ? 0
          : all.map((l) => l.order).reduce((a, b) => a > b ? a : b);
      final ledger = Ledger(
        id: const Uuid().v4(),
        kind: kind,
        name: title,
        icon: icon,
        order: maxOrder + 1,
        synced: 0,
      );
      state.createLedger(ledger);
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 48, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PageHeader(
            icon: '📚',
            title: '账本管理',
            subtitle: '新增账本 · 恢复回收站 · 管理已有',
          ),

          // ---- ① 我的账本 ----
          Text('我的账本',
              style: TextStyle(color: headColor, fontSize: 15, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          if (active.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('还没有账本',
                  style: TextStyle(color: ink500, fontSize: 13)),
            )
          else
            ...active.map((l) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: AppCard(
                    frosted: false,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Text(l.icon ?? '📒',
                              style: TextStyle(fontSize: 24, color: ink900)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(l.name,
                                    style: TextStyle(
                                        color: ink900, fontSize: 15)),
                                const SizedBox(height: 2),
                                Text(_kindLabel(l.kind),
                                    style: TextStyle(
                                        color: ink500, fontSize: 13)),
                              ],
                            ),
                          ),
                          GestureDetector(
                            onTap: () => state.softDelete(l),
                            child: Text('删除',
                                style: TextStyle(color: red, fontSize: 13)),
                          ),
                        ],
                      ),
                    ),
                  ),
                )),

          const SizedBox(height: 16),

          // ---- ② 添加账本 ----
          Text('添加账本',
              style: TextStyle(color: headColor, fontSize: 15, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          ...templates.map((t) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: AppCard(
                  frosted: false,
                  onTap: () => createFromTemplate(t.title, t.icon, t.kind),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Text(t.icon, style: const TextStyle(fontSize: 24)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(t.title,
                                  style: TextStyle(
                                      color: ink900, fontSize: 15)),
                              const SizedBox(height: 2),
                              Text('点击创建',
                                  style: TextStyle(
                                      color: ink500, fontSize: 13)),
                            ],
                          ),
                        ),
                        Text('›',
                            style: TextStyle(color: ink400, fontSize: 20)),
                      ],
                    ),
                  ),
                ),
              )),

          const SizedBox(height: 16),

          // ---- ③ 回收站 ----
          Text('回收站',
              style: TextStyle(color: headColor, fontSize: 15, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          if (recycled.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('回收站是空的',
                  style: TextStyle(color: ink500, fontSize: 13)),
            )
          else
            ...recycled.map((l) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: AppCard(
                    frosted: false,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Text(l.icon ?? '📒',
                              style: TextStyle(fontSize: 24, color: ink400)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(l.name,
                                    style: TextStyle(
                                        color: ink400, fontSize: 15)),
                                const SizedBox(height: 2),
                                Text(_kindLabel(l.kind),
                                    style: TextStyle(
                                        color: ink500, fontSize: 13)),
                              ],
                            ),
                          ),
                          GestureDetector(
                            onTap: () => state.restore(l),
                            child: Text('恢复',
                                style: TextStyle(color: green, fontSize: 13)),
                          ),
                          const SizedBox(width: 16),
                          GestureDetector(
                            onTap: () => state.hardDelete(l),
                            child: Text('删除',
                                style: TextStyle(color: red, fontSize: 13)),
                          ),
                        ],
                      ),
                    ),
                  ),
                )),
        ],
      ),
    );
  }
}
