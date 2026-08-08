# 心愿便利贴 · Android 原生 App（Flutter）

本地优先（local-first）的安卓客户端。与前一版 TWA（只是把网页套个壳）不同，本方案
**所有页面与逻辑都跑在手机本地**，数据存本地 SQLite；只有"数据同步"才走服务端。服务端卡顿
不再影响页面加载，断网也能照常记账，联网后后台自动补传。

## 架构

```
UI (lib/ui)  ──>  State (lib/state, Provider/ChangeNotifier)
                      │ 读：直接读本地库（秒开、离线可用）
                      │ 写：先落本地库（乐观更新），再入队 SyncService
                      ▼
              Local SQLite (lib/data, sqflite)
                      ▲
                      │  SyncService.drainQueue() 重放待同步操作
                      │  SyncService.syncAll() 先推后拉
                      ▼
              服务端 Next.js API（/api，沿用网页版 iron-session Cookie）
```

- **本地数据库**：`AppDatabase`（sqflite）。每张业务表都有 `server_id`（服务端 cuid）和
  `synced`（0/1）两列，用于离线写入后联网把本地行对上服务端并标记已同步。
- **金额**：一律以"分"（整数 cents）存储/传输，避免浮点误差，与后端 `src/lib/money.ts` 一致。
- **软删除**：`deleted_at` 非 NULL 表示已删除，所有列表查询都过滤 `deleted_at IS NULL`。
- **鉴权**：沿用网页版 iron-session Cookie（名为 `mab_session`，httpOnly）。用
  `PersistCookieJar` 把 Cookie 持久化到磁盘，登录后自动带回，重启仍有效，无需自己解析 token。
- **离线队列**：`pending_ops` 表。本地写入先落库，再入队一条操作（POST/PUT/PATCH/DELETE）。
  联网时按创建顺序重放；服务端用 `(ledgerId, clientId)` 唯一约束做幂等，重复提交安全。

## 同步流程（SyncService）

1. 用户在 UI 记一笔 → 本地 SQLite 立即写入（`synced=0`），同时 `enqueue` 一条 POST（带
   `clientId` UUID）。页面立刻刷新，断网也不影响。
2. 联网时（首页点同步，或后续后台触发）调用 `syncAll()`：
   - 先 `drainQueue()` 把本地改动推上去；每条成功后在本地标记 `synced=1`。
   - 再 `pullAll()` 从服务端全量拉回：按 `server_id` 覆盖本地已同步的行，**未同步的本地行被保留
     （不会被覆盖，也不会丢）**。旅游成员 / 桃源活动的金额等涉及跨表 id，拉取时做
     server→local id 翻译。
3. 服务端返回 401 → 清空本地会话，UI 跳回登录页。

## 四种账本

| 账本 | 状态 / 数据层 | 服务端接口 |
|---|---|---|
| 普通 general | `GeneralState` / `general_entries` | `GET/POST/PATCH/DELETE /ledgers/:id/entries` |
| 工作 work | `WorkState` / `work_entries`（按月归账） | `GET/POST/PATCH/DELETE /entries` |
| 桃源 taoyuan | `TaoyuanState` / `taoyuan_events` + `event_amounts` | `GET/POST/DELETE /events`、金额 `POST /events/:id/amounts` |
| 旅游 travel | `TravelState` / `trip_*` | 成员 `GET/POST/PATCH/DELETE /ledgers/:id/members`；花费 `GET/POST/DELETE /ledgers/:id/expenses` |

旅游账本支持多币种（原币 + 汇率算本币）、按最大余额法的 AA 结算（`TripDao.settle`）。

## 本地开发

```bash
cd flutter
flutter pub get
flutter run            # 连真机/模拟器
flutter build apk      # 出 release apk
```

`lib/core/constants.dart` 的 `AppConfig.apiBaseUrl` 填服务端地址（默认 `https://jz.686295.xyz`）。

## CI 构建 APK

打 `v*.*.*` tag（或 Actions 手动触发）即构建 APK：

- `flutter create` 在 CI 动态生成 `android/` 原生工程（本地无需提交该目录，`.gitignore` 已忽略）。
- 自动补 `android.permission.INTERNET`（release 构建联网需要）。
- 自动把 `AndroidManifest.xml` 的 `android:label` 改成「心愿便利贴」（`flutter create` 默认会用 pubspec 的 `name`，即 `myaccountbook`）。
- 产物 `app-release.apk` 作为 artifact 上传。

### ⚠️ 关键：`flutter/lib/main.dart` 必须入库

Flutter 应用入口默认在 `lib/main.dart`。如果该文件**不存在**，CI 的 `flutter create`
会"贴心"地补一个**默认的计数器模板**（标题 "Flutter Demo Home Page"、加号按钮自增），
最终 APK 装上跑的就是这个示例 App，而不是我们的心愿便利贴。

**修复要点**：
- `flutter/lib/main.dart` 必须随仓库提交（项目里目前已放在 `lib/`，不是 `lib/ui/`）。
- `flutter create` 对已存在的源文件**不会**覆盖，所以入库的 `main.dart` 不会被干掉。
- 工作流额外加了断言：scaffold 之后 grep `lib/main.dart` 含 "Flutter Demo Home Page" 就
  立即失败，避免 CI 行为变化导致悄悄变回默认模板。

参考资料：第一次部署时（v2.0.1）漏了 `lib/main.dart` 入库，APK 装上跑的是默认计数器，
正是这次发现的根因。

## 目录结构

```
flutter/lib/
  api/        服务端接口封装（dio + Cookie 持久化）
  core/       常量、金额工具、异常
  data/       db（建表）、models（实体 + fromApi/toApiBody）、local（DAO）
  sync/       连通性探测 + SyncService（离线队列 + 同步引擎）
  state/      Provider 状态（auth / 账本列表 / 四账本）
  ui/         登录、注册、首页账本列表、四账本页面
```
