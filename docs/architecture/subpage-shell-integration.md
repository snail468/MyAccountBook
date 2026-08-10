# 子页外壳接入设计（PRD A3 / A4 / A5 收口）— 架构师 Bob / 高见远

> 配套 `docs/architecture/ui-replication-prd.md` §3（共享设计语言）+ §5 A3/A4/A5；及 `docs/architecture/sync-cards-recurring-design.md`「范围边界」。
> 目的：把前序 sprint 已落地、但**尚未接线**的 `HomeButton` / `FloatingToolbar` / `PageBackButton` 三个控件，按 PRD 三段式布局接入全部 11 个子页；重构 `PageHeader`；补齐 #13 剩余 padding；确认 #12 已合规。
> 硬约束（同前）：颜色全走 `AppColors.light*/dark*`，禁硬编码；容器 `px-6 pt-14` = `(24,56,24,24)`；液态玻璃本轮隐藏（classic 表面）。

---

## 0. 现状核对（已读源码，非猜测）

| Task | 内容 | 现状 | 结论 |
|---|---|---|---|
| #10 | `HomeButton` / `FloatingToolbar` / `PageBackButton` 三控件 | 三文件**已实现**，规格对齐 PRD：各 40×40 r20（经 `AppFloatingButton`）；`HomeButton`=`pushAndRemoveUntil(HomePage)`（清栈、仅子页）；`FloatingToolbar`=👁(no-op)+⚙️(push SettingsPage)；`PageBackButton`=`Icons.arrow_back_ios_new`(18)+`返回`(14, ink500)，`Navigator.pop` | ✅ 控件本身合格；**尚未被任何页面引用**（grep 仅定义文件 + 旧 `page_header.dart`） |
| #11 | 重构 `PageHeader` 为「左侧 ‹返回 + 标题 flex-1 + 右上 FloatingToolbar」 | `page_header.dart` **仍是旧版**（🏠👁⚙️ 在右、无返回）；新顶栏控件未接线 | ⛔ 未开始，本文件核心 |
| #12 | 扩展 `AppearanceSheet`（P0-09 / A5） | `appearance_sheet.dart` **已完整实现**：主题模式(白天/黑夜/系统)、界面风格(仅「默认」，glass→classic 纠偏)、字号(小0.9/标准1.0/大1.15)、光效/音效开关 + 试听(UI 占位)、完成；面板顶圆角 24；引用的 `ThemeState` 字段(`effectOn`/`soundOn`/`style`/`fontScale`)均存在 | ✅ 合规（仅分段钮高度见 §5 小注） |
| #13 | 11 子页容器统一 `(24,56,24,24)` | grep 结果：9 个子页**已符合**；仅 4 个仍 `(16,48,16,24)`：`manage_ledgers_page` / `stats_page` / `trash_page` / `users_page` | ⚠️ 剩 4 文件（见 §4） |

---

## 1. 关键架构决策：子页外壳接入模式

PRD §3.1 要求「顶部全局控件区（HomeButton 左 / FloatingToolbar 右，固定不随内容滚动）+ 中部滚动内容区（pt-14）」。当前各子页自行 `Scaffold + SingleChildScrollView(padding:(24,56,24,24))`，没有固定顶栏层。

**决策：新增一个共享外壳 `SubPageScaffold`，由 11 个子页统一改用，杜绝 13× 重复 Stack 模板、保证顶栏一致。** 不建议每页手写 `Stack`（易漏、易错位）。

```dart
// mobile/lib/ui/widgets/sub_page_scaffold.dart
import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import 'home_button.dart';
import 'floating_toolbar.dart';

/// 子页统一外壳（PRD §3.1 / §3.2 / A3）。
/// - 固定顶栏：左上 HomeButton(top:12,left:12) + 右上 FloatingToolbar(top:12,right:12)，不随滚动。
/// - 滚动内容：SingleChildScrollView，padding (24,56,24,24)（pt-14 清开顶栏）。
/// - 首页/登录不套此壳（各自顶部布局）。
class SubPageScaffold extends StatelessWidget {
  final Widget child;          // 内容（含 PageHeader + 业务组件）
  final bool showHome;         // 默认 true（子页显示左上 HomeButton）
  final bool showToolbar;      // 默认 true（子页显示右上 FloatingToolbar）
  const SubPageScaffold({
    super.key,
    required this.child,
    this.showHome = true,
    this.showToolbar = true,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: Stack(
        children: [
          if (showHome)
            const Positioned(top: 12, left: 12, child: HomeButton()),
          if (showToolbar)
            const Positioned(top: 12, right: 12, child: FloatingToolbar()),
          Positioned.fill(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
              child: child,
            ),
          ),
        ],
      ),
    );
  }
}
```

- `HomeButton` 固定 `top:12`(=top-3)、`left:12`；`FloatingToolbar` 固定 `top:12`、`right:12`；内容 `pt-14=56 = 12+40+4` 恰好清开 40×40 控件，符合设计。
- 首页保留自有布局（状态栏时间 + 右 👁/✨），**不**用 `SubPageScaffold`；其顶部仍是 home 专属工具条（若需 ✨ 可用独立 `HomeToolbar`，不在本任务范围）。

---

## 2. 新 `PageHeader` 契约（#11 重构）

移除旧版「🏠👁⚙️ 在右」的 Row（那些上移到 `SubPageScaffold` 的固定顶栏）；改为内容区内的「‹返回（左）+ 标题（flex-1）」。

```dart
// mobile/lib/ui/widgets/page_header.dart（重构后签名）
class PageHeader extends StatelessWidget {
  final String title;            // 必填
  final String? subtitle;        // 副标（可空，空串不占位）
  final String? icon;            // 可选：页面图标 emoji（如 💳/🔁）
  final bool showBack;           // 默认 true（子页左侧 ‹返回）
  final VoidCallback? onBack;    // 默认 Navigator.pop
  const PageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.showBack = true,
    this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink900 = isDark ? AppColors.darkInk100 : AppColors.lightInk900;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showBack)
          Padding(                       // ‹返回 占一行（左），见 PRD §3.2
            padding: const EdgeInsets.only(bottom: 10),
            child: PageBackButton(onPressed: onBack ?? () => Navigator.of(context).pop()),
          ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            if (icon != null) ...[
              Text(icon!, style: TextStyle(fontSize: 28, color: ink900)),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(color: ink900, fontSize: 22, fontWeight: FontWeight.w700)),
                  if (subtitle != null && subtitle!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(subtitle!, style: TextStyle(color: ink500, fontSize: 13)),
                    ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}
```

> 兼容性：三个参数均为 **命名参数且名字不变**（`icon`/`title`/`subtitle`），现有调用 `PageHeader(icon:'💳', title:'银行卡备份', subtitle:'...')` 仍可直接编译，`icon` 变可选不影响老调用。
> 标题字号：沿用现有 22（PRD §3.6 说「卡标题/面板标题 18」、P0-04 说「普通账本头部标题 20」——PRD 内部不一致；本任务不强行改字号，避免牵动 11 页视觉，保留 22；若主理人要求统一 18 再单独排期）。

---

## 3. 11 个子页改造清单（接入 `SubPageScaffold`）

每个子页把原 `Scaffold(body: SingleChildScrollView(padding:(24,56,24,24), child: Column([PageHeader(...), ...])))` 替换为 `SubPageScaffold(child: Column([PageHeader(...), ...]))`（padding 已内化进外壳，内容区不再重复写 padding）。

| 子页 | dart 文件 | 当前 padding | 动作 |
|---|---|---|---|
| 注册 | `register_page.dart` | (待核，预期已符合) | 套 `SubPageScaffold` + 新 `PageHeader` |
| 普通账本 | `general_ledger_page.dart` | ✅(24,56,24,24) | 套外壳 + 新 `PageHeader` |
| 工作账本 | `work_ledger_page.dart` | ✅ | 同上 |
| 工作汇总 | `work_summary_page.dart` | ✅ | 同上 |
| 桃源账本 | `taoyuan_page.dart` | ✅ | 同上 |
| 旅游账本 | `travel_page.dart` | ✅ | 同上 |
| 统计 | `stats_page.dart` | ⚠️(16,48,16,24) | 套外壳（顺带修 padding，见 §4） |
| 设置外观 | `settings_page.dart` | ✅ | 套外壳 + 新 `PageHeader` |
| 搜索 | `search_page.dart` | ✅ | 同上 |
| 回收站 | `trash_page.dart` | ⚠️(16,48,16,24) | 套外壳 + 修 padding |
| 添加删除账本 | `manage_ledgers_page.dart` | ⚠️ | 套外壳 + 修 padding |
| 用户管理 | `users_page.dart` | ⚠️ | 套外壳 + 修 padding |
| **银行卡备份** | `bank_page.dart` | ✅(我的页) | **必须同步套外壳 + 新 `PageHeader`**（见 §4 协调） |
| **周期记账** | `recurring_page.dart` | ✅(我的页) | **同上** |

---

## 4. 协调：我设计的 2:133 / 2:134 必须同步改造

`bank_page.dart` / `recurring_page.dart`（前序 sprint 由我设计、工程师实现，已用 `(24,56,24,24)` + 旧 `PageHeader`）**属于 11 个子页**，必须纳入本次改造，否则会出现：

- 顶栏无 `HomeButton`/`FloatingToolbar`（新控件只接在 `SubPageScaffold` 里）；
- 旧 `PageHeader` 的 🏠 仍在右、且无 ‹返回，违反 PRD A3。

改造点（对这两页）：
1. 外层 `Scaffold + SingleChildScrollView(padding:(24,56,24,24))` → 替换为 `SubPageScaffold(child: ...)`（padding 内化，删掉重复的 padding）。
2. `PageHeader(icon:'💳', title:'银行卡备份', subtitle:'加密存储卡号 · 查看需验密码')` / `PageHeader(icon:'🔁', title:'周期记账', subtitle:'')` —— 签名兼容，**无需改调用**；🏠 弹出行为改由 `SubPageScaffold` 的固定 `HomeButton` 提供，`‹返回` 由新 `PageHeader` 内的 `PageBackButton` 提供。
3. 页内其余 UI（卡 tile、规则卡、按钮文案/尺寸、液态玻璃隐藏 classic 表面）**保持不变**，已 1:1 对齐设计稿。

> 这两页的同步逻辑（`SyncService._pullCards/_pullRecurring`、`BankState`/`RecurringState` 入队）完全不受影响，仅外壳/头部渲染变化。

---

## 5. #12 已核对通过（仅一处小注）

`appearance_sheet.dart` 已实现 P0-09 全部点：主题模式 / 界面风格(隐藏玻璃，仅「默认」+ 持久化 glass→classic 纠偏) / 字号(0.9/1.0/1.15) / 光效 / 音效 + 试听(UI 占位，P2-04) / 完成；顶圆角 24。引用的 `ThemeState` 字段齐备，可编译。

- **小注（非阻断）**：`SegmentedButton` 用的是 Flutter 默认高度（约 36–40），PRD §3.7 说分段钮「高 44 r12」。若要求逐像素 1:1，可在 `SegmentedButton` 外套 `SizedBox(height:44)` 或设 `style`，否则默认即可接受。建议作为收尾打磨，不阻塞本任务。

---

## 6. #13 剩余 padding 文件（直接改值即可）

将以下 4 个文件的容器 padding 由 `EdgeInsets.fromLTRB(16, 48, 16, 24)` 改为 `EdgeInsets.fromLTRB(24, 56, 24, 24)`（它们若按 §3 套了 `SubPageScaffold`，则 padding 已内化、连 `SingleChildScrollView` 都可删，仅保留业务 `Column`）：

- `mobile/lib/ui/ledgers/manage_ledgers_page.dart` (L86)
- `mobile/lib/ui/stats/stats_page.dart` (L46)
- `mobile/lib/ui/trash/trash_page.dart` (L40)
- `mobile/lib/ui/users/users_page.dart` (L42)

> 其余子页（含我设计的 bank/recurring、general/work/taoyuan/travel/search/settings/work_summary）**已符合**，勿回退。

---

## 7. 验证边界

- 本环境无 Flutter SDK，无法 `flutter analyze`；以上为源码级核对，编译由 CI 把关。
- 验收基准：`AppColors.light*/dark*` 无硬编码；11 子页均有左上 `HomeButton` + 右上 `FloatingToolbar` + 内容 ‹返回 + 标题 flex-1；容器 `(24,56,24,24)`；设计稿 `2:131`–`2:139` 浅/深素材一致。
- 回归风险点：改 `PageHeader` 签名/行为会波及其余 11 个调用页，**必须全量替换并自测导航**（🏠 回首页清栈、‹返回 pop、⚙️ 进设置、👁 no-op）。

---

## 8. 提供给工程师的落地顺序建议

1. 新增 `sub_page_scaffold.dart`（§1）。
2. 重构 `page_header.dart`（§2，保持命名参数兼容）。
3. 11 个子页（含 bank/recurring，§3/§4）套 `SubPageScaffold` + 新 `PageHeader`。
4. #13 剩余 4 文件 padding（§6）。
5. （可选）#12 分段钮高度打磨（§5 小注）。
6. 自检：进每个子页确认顶栏出现、导航正常；CI 编译通过。

> 设计契约到此为止；实现细节（如 `SegmentedButton` 精确高度）由工程师在 PRD 允许范围内拍板。
