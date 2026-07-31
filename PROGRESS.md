# 改造进展与待办

> 记录本轮改造已完成的内容、验证方式，以及尚未动工的部分。
>
> 分支：`refactor/data-safety-and-pagination`（领先 `main` 11 个提交，96 个文件，+20966 / -843）
> 最后更新：2026-07-30

---

## 目录

- [一、当前状态速览](#一当前状态速览)
- [二、已完成](#二已完成)
  - [2.1 数据安全](#21-数据安全)
  - [2.2 列表分页](#22-列表分页)
  - [2.3 安全加固](#23-安全加固)
  - [2.4 正确性修复](#24-正确性修复)
  - [2.5 性能](#25-性能)
  - [2.6 新功能](#26-新功能)
  - [2.7 工程化](#27-工程化)
  - [2.8 Cloudflare 部署（已放弃并移除）](#28-cloudflare-部署已放弃并移除)
  - [2.9 过程中发现并修掉的既有 Bug](#29-过程中发现并修掉的既有-bug)
  - [2.10 分支预览部署时暴露的问题](#210-分支预览部署时暴露的问题本轮改动自身引入)
  - [2.11 代码整洁](#211-代码整洁)
  - [2.12 全量 JSON 导入还原](#212-全量-json-导入还原)
  - [2.13 上传前图片压缩](#213-上传前图片压缩)
  - [2.14 跨账本全局搜索](#214-跨账本全局搜索)
  - [2.15 统计图表页](#215-统计图表页)
  - [2.16 银行卡备份](#216-银行卡备份加密存储)
- [四、待做](#四待做)
- [五、验证与部署命令速查](#五验证与部署命令速查)

---

## 一、当前状态速览

| 项目 | 状态 |
|---|---|
| 部署方式 | **只有 Docker**。Cloudflare 相关代码与文档已全部移除 |
| Docker 部署链路 | ✅ 可用，本地 standalone 实测真实查询通过 |
| 单元测试 | ✅ 229 个，全部通过（route 层不在单测范围，靠 build + 真实请求冒烟覆盖） |
| CI（typecheck / lint / test / build） | ✅ 已配置，每次 push 与 PR 都跑 |
| 是否已合并 main | ❌ 未合并 |

**分支说明**

| 分支 | 内容 |
|---|---|
| `main` | `7d6b75c`，改造前的状态，你 Docker 生产环境跑的就是这个 |
| `refactor/data-safety-and-pagination` | 本轮全部成果 |

---

## 二、已完成

### 2.1 数据安全

#### 导出补全（原来会丢一半数据）

**问题**：`/api/export` 只导出 `Entry`（工作账本）和 `Event`（桃源账本），**完全没有**普通账本（`GeneralEntry`）和旅游账本（`TripExpense` / `TripMember` / `TripSplit`）。而 README 和首页按钮都在暗示这是全量备份 —— 按提示备份完再删库，普通账本和旅游账本的数据就没了。

**做法**

- 新增 `src/lib/exportData.ts` 作为统一采集层，覆盖全部 6 张业务表。CSV 与 JSON 共用它，**从结构上杜绝再次漏表**
- CSV 新增 4 个分区：普通账本明细、普通账本设置、旅游账本概览/成员/支出明细、**旅游账本成员净额对账**
- 新增 `GET /api/export/json`：版本化全量备份（`BACKUP_VERSION = 1`），含软删除中的账本（还在 60 天保留期内的数据也该备）
- 导出按钮改为双格式入口，导出后回显条数摘要

**刻意的取舍**：JSON 备份**不含密码哈希**。备份文件落在用户手里，不该带哈希。代价是它不能用于迁移用户账号 —— 要迁账号请直接复制 `app.db` 文件（数据库就一个文件，`cp` 即可）。

#### 数据库迁移版本化（原来每次启动都可能静默丢列）

**问题**：`docker-entrypoint.sh` 每次容器启动都跑 `prisma db push --accept-data-loss`。任何 schema 改动（改字段名、改类型、去掉可选性）都会**静默丢列**，没有版本记录、无法回滚。

**做法**

- 新增 `prisma/migrations/0_init/`（baseline）与 `20260730011420_add_user_security_fields/`
- `docker-entrypoint.sh` 改用 `prisma migrate deploy`，并自动识别三种情况：
  - 全新库 → 直接建表
  - v1 时期 `db push` 建的老库 → 先 baseline（只登记不执行），再增量应用
  - 已迁移过的库 → 只跑新迁移
- 判据是 `migrate deploy` 的真实结果：撞上 P3005 才 baseline 再重试，其他错误直接退出
  （最初用 `/data/.prisma-baselined` 标记文件区分，实际部署时翻车了 —— 见 2.10）
- 支持 `SKIP_DB_MIGRATE=true` 跳过（手工修库时用）
- 新增 npm scripts：`prisma:status`、`prisma:baseline`

**验证**：手写的 `0_init/migration.sql` 与 `prisma migrate diff` 的输出**逐行一致**（145 行，零差异）；全新库 `migrate deploy` 成功；`migrate status` 显示 up to date；漂移检查输出为空。

#### 图片生命周期（原来只增不减）

**问题**：`storage.ts` 完全没有删除能力。删掉一整个旅游账本，几十张小票照片永远留在 `data/uploads/`（或对象存储）里。

**做法**

- `storage.ts` 新增 `deleteObject` / `keyFromUploadUrl` / `deleteUploadUrls`，含对象存储的 DELETE 签名
- 新增 `src/lib/imageCleanup.ts`，**带引用计数** —— 同一张图被多条记录引用时不会误删
- 接入 5 个路径：普通条目删除/编辑、旅游支出删除/编辑、账本永久删除、回收站 60 天到期硬删
- 清理失败**绝不影响主删除操作**（只记日志）

---

### 2.2 列表分页

**问题**：所有列表页把该账本**全部**记录查出来塞进客户端组件并全量渲染。记满一两年后首屏明显卡顿，RSC payload 膨胀。

**做法**：新增 `src/lib/pagination.ts`，用 `(occurredAt, id)` **复合游标**而非 offset —— 边翻页边记账不会错位；带 id 是因为 `datetime-local` 精度下同一秒很容易有多条。

| 页面 | 分页方式 |
|---|---|
| 普通账本 | 首屏 50 条 + 「加载更早的记录」 |
| 工作出项汇总 | 同上，新增独立的 `ExpenseList` 客户端组件 |
| 旅游账本 | **按阶段各自一套游标**（行前/行中独立分页） |
| 桃源账本 | **只对「已到账」归档分页**；活跃项（published/predicted/announced）全量加载 |

**桃源账本的设计取舍**：活跃项是用户正在跟踪的工作项，数量天然有界，而且 `MergeBar` 的合并功能需要看到全部候选；只有「已到账」会无限增长。所以只分页后者。

**旅游账本的关键约束**：阶段合计、成员净额、最优结算**全部下推到服务端 SQL 聚合**。结算必须基于全量数据 —— 客户端分页后手里只有片段，算出来是错的。趣味报告要算「最烧钱的一天」「恩格尔系数」这类跨全量统计，改为打开弹窗时按需拉全量，不拖慢列表首屏。

---

### 2.3 安全加固

对应审查报告第三部分全部 8 项。

#### 登录限流

`src/lib/loginThrottle.ts` + `User.failedLoginCount` / `User.lockedUntil`。

按用户名累计连续失败，分档锁定：5 次锁 1 分钟、10 次锁 5 分钟、15 次锁 15 分钟、20 次锁 1 小时，成功即清零。

**为什么用递增锁而不是永久锁**：永久锁会让攻击者只要知道用户名就能把人锁在门外（拒绝服务）。递增窗口把爆破速度压到无意义，正常用户等一下就能继续。

状态落在 `User` 表而不是内存 —— 容器重启不能把计数清零，否则攻击者只要触发一次重启就能重新开始爆破。

**实测**：连续错密码 4 次返回 401，第 5 次返回 429「请 1 分钟后再试」，锁定期内**正确密码也拒绝**。

#### 会话失效

`User.sessionVersion`。改密码或管理员重置密码后，其它设备上已签发的 cookie 立即作废；当前设备换发新会话不被踢下线。

**实测**：改密码后旧 cookie 访问首页，响应体含 `NEXT_REDIRECT;replace;/login` 且不含用户名；当前设备会话仍可用；旧密码返回 401。

#### 自助改密码

新增 `PATCH /api/auth/password` + 首页「修改密码」入口（`ChangePasswordButton.tsx`）。原来只有管理员重置一条路，普通用户改密码得找管理员。

#### 密码策略

`src/lib/passwordPolicy.ts`。下限从 6 提到 8，拒绝常见弱口令、含用户名、纯连续数字/字母、单字符重复。四处统一应用：注册、管理员建号、管理员重置、自助改密码。

**刻意不强制「大写+数字+符号」** —— 那只会逼出 `Password1!` 这类又难记又好猜的密码。

#### CSRF 防护

`src/middleware.ts`：所有非幂等方法校验 `Origin` / `Referer` 同源，两者都缺则拒绝。

重点是 `/api/events/upload` 收 `multipart/form-data` —— 那是**跨站表单能直接提交**的内容类型。

**实测**：跨站 Origin 提交返回 403；完全不带 Origin/Referer 也返回 403。

#### CSP 与安全响应头

`middleware.ts` 为每个请求生成 nonce，`script-src` 为 `'self' + nonce + strict-dynamic`，**没有 `unsafe-inline`**。layout 里两段内联脚本带 nonce 通过。

`next.config.mjs` 下发 `X-Content-Type-Options: nosniff`、`Referrer-Policy`、`Permissions-Policy`、`X-Frame-Options: DENY`、HSTS，并关掉 `poweredByHeader`。

**代价**：layout 需要读 `headers()` 拿 nonce，这会让 `/login` 和 `/ledgers/new` 从静态预渲染变成动态渲染。对本项目可忽略（其它页面本来就 `force-dynamic`）。

#### 上传文件校验

`src/lib/imageSniff.ts`：只认文件内容的魔数（jpg/png/gif/webp），不信任客户端声明的 MIME。拒绝 HTML/SVG/PDF 伪装、空文件、超短文件、`RIFF` 但非 `WEBP`（如 wav）。

存储路径改为**内容寻址** `<userId>/<yyyy-mm>/<sha256前24位>.<ext>`，替掉原来「清洗标题 + 扫描目录找编号」的方案 —— 消除并发覆盖竞态、去掉最多 999 次 `access` 系统调用、天然幂等。

#### 密码哈希改 Web Crypto PBKDF2

**起因**是 Cloudflare 的 CPU 限制（那条路已放弃），但**对 Docker 也是净收益**：`bcryptjs` 是纯 JS 实现，`crypto.subtle` 的 PBKDF2 走原生代码，同等安全强度下 CPU 占用低得多。

**实测数据（本机）**

| 方案 | CPU 耗时 |
|---|---|
| bcryptjs cost=10（原实现） | 70.8 ms |
| PBKDF2-SHA256 10,000 次 | 4.8 ms |
| PBKDF2-SHA256 25,000 次 | 11.3 ms |
| PBKDF2-SHA256 600,000 次（OWASP 推荐，**现默认值**） | 237.0 ms |

**注意**：PBKDF2 单看数字「更快」，**是因为迭代次数低**，不是算法白送性能。Docker 上用的是 OWASP 推荐的 600000 次 —— 比原来的 bcrypt **更慢也更安全**，这是正确的方向。237ms 对登录这种低频操作完全可接受。

迭代次数由 `PASSWORD_KDF_ITERATIONS` 可调（钳制在 1 万 ~ 1000 万），不设即用 600000。

**实现要点**

- 哈希格式自描述：`pbkdf2-sha256$<迭代>$<盐b64>$<派生b64>`
- 验证时用**哈希串里记录的**迭代次数，不是当前配置 —— 否则改一次配置就把所有老密码判为错误
- 向后兼容：`$2a$`/`$2b$`/`$2y$` 前缀继续走 bcrypt 验证；登录成功后自动重算升级（尽力而为，失败不影响登录）
- 定长时间比较派生结果
- base64 用 `btoa`/`atob` 而非 Node Buffer，Workers 也能跑

**实测跨格式兼容**：造一个 bcrypt 老用户 → 登录 200（235ms，含验证+重算）→ 哈希变为 `pbkdf2/20000` → 再登录 31ms → 错密码仍 401。

#### 其它

- `SESSION_SECRET` 生产环境缺失或短于 32 字符时**拒绝启动**（`src/lib/env.ts`），不再静默回退到硬编码默认值
- 登录接口对不存在的用户也走一次哈希比较，消除用户名枚举的时序差异

---

### 2.4 正确性修复

#### 分摊金额改服务端权威计算

**问题**：客户端算好 `shareCents` 提交，服务端只校验「和值差不超过 `max(2, 人数)` 分」。50 人时允许 **0.5 元**偏差落库，长期累积对不上账。

**做法**：`src/lib/splitAllocation.ts`

- 客户端只提交「谁参与 + 权重」，金额由服务端用**最大余额法**分配，`sum(shares)` 严格等于总额，并有守恒断言
- 三种 UI 模式（全员平摊 / 部分平摊 / 按比例）收敛成同一条计算路径
- **客户端预览调用同一个 `allocateByWeight`**，所以界面显示的金额就是落库的金额
- 小数部分相同时按 `memberId` 排序，保证幂等

**顺带堵掉两个漏洞**

1. `PATCH` 路径原来有自己一份带容差的校验（等于给绕过留了后门），现在与 `POST` 共用 `resolveShares`
2. **只改金额不改分摊人时原来完全不校验**，会留下不守恒的账；现在按原比例重新分配

兼容旧客户端的 `splits` 字段，但改为**零容差**校验。

#### 结算尾差与守恒断言

**问题**：`computeSettlement` 用 `> 1` / `<= 1` 分的阈值跳过小额，净额恰为 ±1 分的成员被**直接忽略**，转账总额与债务总额不相等。

**做法**：严格按 `!= 0` 筛选、严格清零推进，返回前断言转账总额 == 应收总额。新增 `computeSettlementSafe` —— 老账本可能存了不守恒的历史数据，页面用容错版本并在界面上提示用户去修那笔账，而不是整页 500。

#### 税额档位可配置

`src/lib/tax.ts` 从 if 链抽成 `TaxBracket[]` 表，支持自定义与校验，并保证税额不为负、不超过收入。

#### 汇率优化与错误分类

- 只落 `COMMON_CURRENCIES` 的 16 个币种，不再把上游约 200 个塞进一个事务
- 缓存写失败不再让查询失败
- 新增 `getRateDetailed` 区分四种结果：正常 / 过期缓存可用（带 `stale` 与已缓存小时数）/ 币种不支持（400）/ 服务不可用（503）
- 上游对未知币种返回 404，与网络故障分开处理 —— 前者让用户手填，后者提示稍后重试

**实测**：`ZZZ` → 400 `UNSUPPORTED_CURRENCY`；`JP`（格式错）→ 400；`JPY` → 200 带真实汇率。

#### 「本月」边界改服务端计算

原来在客户端用 `useMemo(() => new Date(), [])` 算一次，且**只有下界** —— 未来日期的记录会被算进本月，还有 hydration 差异风险。现在服务端算好传入，并加上界；客户端加一个到次日零点的定时刷新，挂着过夜会自动翻篇。

#### bootstrap 逻辑从会话校验里剥离

`requireUserWithRole()` 原来每次调用都串行做四件事（adminBootstrap → 查用户 → ensureLedgers → 回收站迁移/清理），首页每次渲染都过一遍。现在按「全局一次性」/「每用户一次性」拆进 `src/lib/bootstrap.ts`，会话校验回归成一条纯查询。

**踩过的坑**：本来想用 Next 的 `instrumentation.ts` 启动钩子，但它会被同时打进 edge runtime 包，而链路上的 `storage.ts` 用了 `node:path`，webpack 报 `UnhandledSchemeError`。改用进程级 flag 的懒初始化。

---

### 2.5 性能

- **首页消除 N+1**：原来在 for 循环里逐个账本发 1~2 条查询，账本一多首页线性变慢。现在按类型各发一组 `groupBy`，**查询数固定 3 条，与账本数量无关**
- 工作账本累计、普通账本本月汇总与类别排行、工作出项全部聚合、按类别聚合 —— 全部从内存 `reduce` 改为 SQL 聚合
- 旅游账本的成员净额改为两次 `groupBy`（按付款人、按成员），不再加载明细

---

### 2.6 新功能

#### 工作出项汇总 · 按类别累计统计卡片

`/work/expenses` 新增卡片组，每个出项类别一张卡，显示：

- 累计金额、笔数、占总额比例
- 已回款 / 未回款金额拆分
- 回款进度条
- 结清标记 ✓

总览卡也补上了笔数与整体回款进度。全部走 `groupBy` 聚合。

`refundedAt` 是日期不是布尔，没法直接 group by 它的空/非空，所以单独查一次已回款再合并。

#### 全量 JSON 备份

见 [2.1 导出补全](#导出补全原来会丢一半数据)。

#### 健康检查端点

`GET /api/health` 做一次**真实的数据库往返**（`SELECT 1`）。进程活着但数据库连不上（volume 没挂对、文件权限错）时也报不健康，否则容器一直显示 healthy 而应用其实是坏的。`docker-compose.yml` 的 healthcheck 从探 `/` 改为探它。

---

### 2.7 工程化

#### 单元测试（110 个，8 个文件）

重点压在**直接决定钱数**的纯函数上。

| 测试文件 | 覆盖重点 |
|---|---|
| `splitAllocation.test.ts` | 1..50 人 × 7 种金额的**守恒穷举**、幂等性、负总额、权重为 0、重复成员 |
| `settlement.test.ts` | **300 轮随机场景压测**：分摊守恒 ⇒ 结算必然守恒；±1 分净额不被忽略；不守恒时抛错 |
| `tax.test.ts` | 每档边界前后一分、单调性、档位切换不倒挂、税额不超过收入 |
| `auth.test.ts` | 哈希格式、盐随机性、改配置不失效、中文/emoji/超长密码、哈希串被篡改不抛错、bcrypt 兼容、`needsRehash` 各分支 |
| `money.test.ts` | 元分换算的浮点陷阱、千分位、与 `formatYuan` 互为逆运算 |
| `pagination.test.ts` | 游标往返、非法游标不抛错、复合条件、上限截断、多取一条判断下一页 |
| `passwordPolicy.test.ts` | 弱口令、含用户名、连续字符；「只是含有连续片段」不误伤 |
| `imageSniff.test.ts` | 四种真图；HTML/SVG/PDF/wav 伪装被拒；超短文件不越界读取 |

#### CI

`.github/workflows/ci.yml`：`typecheck` → `lint` → `test` → `build` 四道检查，每次 push 和 PR 都跑。原来只有构建 Docker 镜像的 workflow，代码问题要等到打镜像才暴露。

#### 其它

- **ESLint flat config**（`eslint.config.mjs`）：原来 `package.json` 有 lint 脚本但根目录没有任何配置文件，实际跑的是内置默认，等于没在用。补齐后立刻抓出一处死代码（`PresetPicker` 里未使用的 `useRouter`），并清掉一批失效的 `eslint-disable` 注释
- **Prettier + `.editorconfig`**
- **`.gitattributes`**：强制 `*.sh` / Dockerfile / yml 用 LF。Windows 上 checkout 成 CRLF 后，容器里 `/bin/sh` 会因行尾 `\r` 报 `bad interpreter` —— `docker-entrypoint.sh` 正好在这条路上
- **提交 `package-lock.json`**：原来没提交，Dockerfile 里 `npm ci` 那个分支一直走不到，每次构建都可能装到不同小版本
- **Node 20 → 22**（CI 与 Dockerfile 同步）：Node 20 已于 2026-04 结束维护
- **`src/lib/logger.ts`**：结构化日志（生产输出 JSON 便于解析），带 `setErrorReporter` 钩子，将来接 Sentry 不用改调用点。**注意：目前只有 `currency.ts` 接入了，其它地方仍是 `console.warn`**
- 根目录散落的源素材（图标 jpg / 音效 mp3 / 需求 txt）收进 `assets/source/`，附说明文件讲清与 `public/` 下产物的对应关系
- 新增 npm scripts：`typecheck` / `test` / `test:watch` / `format` / `format:check` / `verify`

---

### 2.8 Cloudflare 部署（已放弃并移除）

**决定**：放弃 Cloudflare Workers 部署，只保留 Docker。相关代码、配置、脚本、
文档已全部从仓库移除。

**放弃的原因**：Prisma 5.x 在 Workers 上无法访问数据库，且无解。
`@prisma/client` 的 package exports 里 `workerd` 条件指向带 Rust 查询引擎的入口，
它在实例化时就探测文件系统找引擎二进制，运行时报

```
prisma:error [unenv] fs.readdir is not implemented yet!
```

表现是**首页能开、任何查库页面 500** —— 首页未登录时在 `getSession()` 就返回 null
跳转了，根本不碰数据库，所以看起来是好的。

试过三条路，全部失败：

| 尝试 | 结果 |
|---|---|
| 把动态 `require` 改成静态 ESM 导入适配器 | 适配器确实加载了，但引擎探测是独立问题 |
| webpack 别名把 `@prisma/client` 指向 `@prisma/client/wasm` | 无效。Next 把它列为 server external package，webpack 不打包、原样留 `require`，之后 esbuild 重新解析又回到引擎版 |
| 升级到 Prisma 6.19.3 + 全环境走 libsql 适配器 | 无效，报错依旧。6.19 虽然 `driverAdapters`/`queryCompiler` 已 GA，但生成的 client 仍附带 query_engine，默认入口就是引擎版 |

剩下的解法是升级 Prisma 7（客户端默认 Rust-free、generator 输出到显式路径），
但那是一次实打实的迁移，且同样会让 Docker 依赖 `libsql` 原生模块 ——
而镜像基础是 `node:22-alpine`（musl），能不能装上未经验证。
投入产出不划算，故放弃。

**移除清单**

| 类型 | 内容 |
|---|---|
| 删除的文件 | `wrangler.toml`、`open-next.config.ts`、`prisma/turso-setup.sql`、`scripts/` 下三个 Turso 脚本 |
| 移除的依赖 | `@opennextjs/cloudflare`、`wrangler`、`@libsql/client`、`@prisma/adapter-libsql`（共减少 303 个包） |
| 移除的 npm scripts | `build:cf` / `deploy:cf` / `preview:cf` / `turso:*` 五个 |
| 代码 | `db.ts` 回归纯本地 SQLite（保留 WAL 修复）；`next.config.mjs` 去掉 libsql 的 tracing includes；`tsconfig.json` 去掉 open-next 排除项 |
| 文档 | README 删掉三个 CF 章节（727 → 283 行）；`.env.example` 去掉 Turso 配置 |

**保留的部分**

- `src/lib/storage.ts` 的对象存储支持**保留**。它是手写的通用 S3 SigV4 签名，
  MinIO / Backblaze B2 / AWS S3 都能用，且完全由环境变量开关 ——
  四个 `R2_*` 变量不填齐就走本地文件系统，一行代码都不执行。
  注释已从「Cloudflare 专属」改为「S3 兼容」。变量名保留 `R2_` 前缀是历史原因。
  如果确定永不使用对象存储，可以再删。
- `.node-version`（= 22）保留。它同时给 CI 和 nvm/fnm 用，是 Node 版本的唯一声明处。

---

### 2.9 过程中发现并修掉的既有 Bug

这些都不是本轮改动引入的，是原有代码里的问题。

| # | Bug | 影响 |
|---|---|---|
| 1 | `PRAGMA journal_mode=WAL` 用 `$executeRawUnsafe` 执行，SQLite 下因返回结果行报错、被 catch 吞掉只打一条 warn | **WAL 从未真正生效**，`db.ts` 里「让多人同时读写不互相锁死」的注释一直是空头承诺。改用 `$queryRawUnsafe`，已验证 `journal_mode` 确为 `wal` |
| 2 | `session.destroy()` 在会话版本不符时被调用，而该函数会在页面渲染（RSC）里执行 | Next 只允许在 Route Handler / Server Action 改 cookie，实测抛 `Cookies can only be modified in a Server Action or Route Handler`。改成只返回 null，不带副作用 |
| 3 | `db.ts` 用 `Function('return require')()` 动态加载数据库适配器 | 取不到 `require` 时异常被 catch 吞掉，**静默回退**成另一套配置。这类「出错也不报错」的写法已整体移除 |
| 4 | `PresetPicker.tsx` 是客户端组件，却 import 了 `@/lib/currency`，而后者 import 了 prisma | 服务端代码被拖进客户端模块图。币种常量已拆到 `lib/currencyList.ts` |
| 5 | `PresetPicker.tsx` 里 `useRouter()` 的返回值从未使用 | 死代码，由新增的 ESLint 配置抓出 |
| 6 | README 说本地库在 `data/app.db` | 实际 Prisma 对 SQLite 相对路径**相对 schema 目录**解析，落在 `prisma/data/app.db`。Docker 用绝对路径不受影响 |
| 7 | `hashOf` / `monthKey` 在 `storage.ts` 里定义但从未被调用；注释描述的 key 结构与实现不符 | 已随内容寻址改造用起来，注释与实现一致 |
| 8 | `docker-entrypoint.sh` 在 Windows 上 checkout 会变 CRLF | 容器里 `/bin/sh` 报 `bad interpreter`。已用 `.gitattributes` 锁定 LF |

**这一轮的副产品仍然有效**（都是修 CF 过程中发现的既有问题）：

- 上传路径改内容寻址、图片魔数校验（见 2.3）
- 密码哈希改 PBKDF2（见 2.3）—— 起因是 Workers 的 CPU 限制，
  但它对 Docker 也是净收益：`bcryptjs` 纯 JS 实现本机耗 70.8ms，
  PBKDF2 走原生实现，同样强度下 CPU 占用低得多
- `db.ts` 的 WAL 修复、`session.destroy()` 渲染期异常、
  客户端组件误引 prisma（见 2.9）

### 2.10 分支预览部署时暴露的问题（本轮改动自身引入）

前两条本地怎么测都测不出来 —— 都只在「HTTP 部署 + 真实数据目录」这个组合下才出现。

| # | 问题 | 表现与修法 |
|---|---|---|
| 1 | CSP 无条件带 `upgrade-insecure-requests` | 通过 `http://IP:3001` 访问时，浏览器把 `/_next/static` 的 CSS、JS 和所有同源导航全升级到 https，而服务端只监听 HTTP → 页面完全没样式、点任何链接都报 `ERR_SSL_PROTOCOL_ERROR`。改成按请求真实协议判断（`x-forwarded-proto` 第一跳，否则 `nextUrl.protocol`），HTTPS 下照旧发送 |
| 2 | 用 `/data/.prisma-baselined` 标记文件判断「是否已纳入 migrate 管理」 | 标记的是**目录**而不是**库**。预览实例先用空库跑起来生成了标记，事后把生产库（`db push` 时代、无 `_prisma_migrations`）拷进同一目录 → baseline 分支被跳过 → `migrate deploy` 报 P3005，配上 `restart: unless-stopped` 就是无限 crashloop。改成先试 deploy、只在 P3005 时补 baseline 再重试 |

**教训**：不要用「旁路的痕迹」代替「对目标本身的检查」。标记文件、时间戳、缓存标志
这类东西一旦与真实对象解耦，就会在最不该出错的时候给出一个自信的错误答案。

### 2.11 代码整洁

原 [4.6](#46-代码整洁第七部分剩余) 的四项，全部完成。

**统一 API 错误响应** —— 新增 `lib/apiError.ts`

改造前 30 个 route 各自手写 `NextResponse.json({ error }, { status })`，同一件事有三种
说法（`不存在` / `账本不存在` / `not found`），参数不合法也有三种（`参数错误` /
`请求格式错误` / `bad path`，还混着英文）。现在收敛成一组具名构造器，并且**把状态码的
判定规则写进了模块头注释**——判据落在代码里才不会再次走样：

- 401 未认证 · 403 已认证但不允许 · 400 请求不合法 · 409 状态冲突 · 413/415/429/503
- **404 同时覆盖三种情况**：不存在、不属于你、类型不对。后两种归到 404 是有意的：
  返回 403 等于告诉对方「这个 id 是存在的」，给了枚举他人资源的探针
- 响应体保留 `error` 文案字段（前端都在读它做提示），新增稳定的 `code` 机器码

有意的例外记在注释里：`/api/auth/password` 的「当前密码不正确」用 403 而非 401 ——
会话是有效的，只是二次验证没过，返回 401 容易让客户端误判成会话失效把人踢去登录页。

**抽取归属校验** —— 新增 `lib/ownership.ts`

`ownLedger`/`ensureOwn` 原本在 7 个 route 文件里各写一遍（4 份逐字相同），活动相关的
路由甚至没抽函数、直接内联。现在统一成 `requireOwnedLedger` / `requireOwnedEntry` /
`requireOwnedGeneralEntry` / `requireOwnedTripExpense` / `requireOwnedEvent` /
`requireOwnedEventAmount` / `requireSessionUser` / `requireAdmin`，返回值要么是上下文、
要么是**已构造好的错误响应**（`NextResponse` 继承 `Response`，一句 `instanceof` 同时
兜住 401 和 404）：

```ts
const ctx = await requireOwnedLedger(id, { kind: 'travel', kindMessage: '仅旅游账本可用' });
if (ctx instanceof Response) return ctx;
const { user, ledger } = ctx;
```

顺带把中间件的 CSRF 403 也换成同一个格式 —— 它之前也是手写的，前端得为它特判。

这一步同时是 [B7 账本共享协作](#44-功能--b-层)的前置：那一轮要改的正是这条链路，
从 7 处改成 1 处之后风险小得多。

**logger 全面接入** —— 10 个文件 18 处 `console.*` 清零

`logger.ts` 原来只有 `currency.ts` 在用。为 warn 场景导出了 `errorFields(err)`：项目里
有不少「尽力而为、失败不影响主流程」的清理逻辑，该记 warn 而不是 error（不值得触发
告警），但仍想留下错误详情。

**验证**：`npm run verify`（typecheck + lint + 123 单测）全过；生产构建通过；
另起一个干净库跑了 30 项真实 HTTP 冒烟测试 —— 未登录 401、CSRF 403、归属 404、
类型不符 404、参数 400、重名 409、改密码二次验证 403、登录失败 401，全部符合预期。
（route 层不在单测范围内，见 `vitest.config.ts` 的说明。）

### 2.12 全量 JSON 导入还原

原 [4.2 A 层](#42-功能--a-层)的头号项。导出端早就有了，导入端补齐后
「换服务器 / 换账号」才算走得通。

**分三层，中间两层是纯函数**（可进单测，符合 `vitest.config.ts` 的约定）：

| 层 | 文件 | 职责 |
|---|---|---|
| 校验 | `lib/importData.ts` `parseBackup` | JSON 结构、版本兼容性；错误信息指到具体字段路径 |
| 计划 | `lib/importData.ts` `planImport` | 重映射所有 id 与外键，算出要写哪些行 |
| 执行 | `lib/importExecute.ts` `applyImport` | 一个事务里落库 |

**为什么一律重映射 id 而不沿用原 id**：备份里是原库的 cuid，直接沿用有两个坑 ——
同一份备份被两个账号导入会撞主键，merge 模式会和现有数据撞。重映射一次解决两者，
代价只是「还原后 id 变了」，而 id 从不对用户可见。

**三种模式**：

- `dryRun` 只校验并返回预览，不写任何东西 —— UI 里选完文件自动先走这步
- `merge` 保留现有数据追加导入
- `replace` 先清空当前账号的全部业务数据再导入。**删除和插入在同一个事务里**，
  所以「删完了但没导进去」这种最坏情况不可能发生

**悬空引用一律降级而不是报错**：父活动不在备份里 → 摘成顶层活动；付款人找不到 →
丢弃那笔支出。宁可少一条关联，也不能插入悬空外键让整个事务炸掉 ——
而且每一处降级都会计数，导入完如实告诉用户跳过了什么。

**图片**：JSON 备份**不含图片文件本身**，只含引用 URL。导入时把 URL 里的 owner 段
改写成导入者的 id —— 用户若把 `data/uploads` 一起搬过来就能对上，没搬反正都是 404。
UI 在导入后会明确提示这一点。

版本常量抽到了不依赖 prisma 的 `lib/backupFormat.ts`，否则导入端的纯函数单测会
顺着 import 把 PrismaClient 拉起来连数据库。

**验证**：23 个单测覆盖 id 重映射、父子关系、内置账本跳过、旅游外键降级、图片 URL
改写；13 项真实 HTTP 往返冒烟 —— 造数据 → 导出 → dryRun（确认没写库）→ merge
（条数翻倍、外键自洽、分摊守恒、id 无重复）→ replace（条数还原）→ 四种坏输入 400 +
未登录 401；UI 在**生产构建**下用真实备份文件走通了 选文件 → 预览 → 两个操作按钮。

> dev server 下整页 hydration 有时迟迟不发生（连未改动的组件也点不动），
> 这是本地 dev 环境的现象，`next build` + `next start` 下一切正常。
> 验证交互别只用 `next dev`。

### 2.13 上传前图片压缩

原 [4.1 性能](#41-性能第四部分剩余)的第一项。新增 `lib/imageCompress.ts`，
在浏览器里用 canvas 缩到长边 1600px 再上传。

**三条硬性原则**（都体现在代码里）：

1. **压缩失败绝不阻断上传** —— 解码失败、canvas 被隐私模式禁用、内存不足，
   一律退回原文件。调用方不需要 try/catch
2. **压完更大就用原图** —— 对已经压过的图重新编码，变大是常事
3. **GIF 一律不碰** —— canvas 只能拿到第一帧，压完动图就死了

另外小于 300KB 的直接放行（再压省不下多少，不值得付解码开销）；
输出格式优先 WebP，浏览器不支持才退回 JPEG。

**实测（生产构建 + 真实浏览器）**：造一张 4000×3000 的纯噪点 JPEG（最难压的极端
情况，真实照片只会更好）——

| | |
|---|---|
| 原图 | 11.6 MB |
| 压缩后 | 752 KB（**压掉 93.7%**）|
| 服务端实际存下 | 769,690 字节 |

值得注意的是：这张 11.6MB 的原图本来会被服务端 8MB 上限直接 413 拒掉，
压缩后反而传上去了 —— 压缩顺带把「大图传不上去」也解决了。

16 个单测覆盖尺寸换算（含极端细长图、非法尺寸）、GIF 跳过、小图跳过、
「压完更大就弃用」的判定。canvas 部分靠上面的真实浏览器测试覆盖。

### 2.14 跨账本全局搜索

原 [4.2 A 层](#42-功能--a-层)的第二项。新增 `/search` 页与 `GET /api/search`，
支持关键字、时间范围、金额区间、类别、标签、收支方向、搜索范围七类条件。

**四个来源的字段并不整齐**，搜索层先做一次归一：

| 来源 | 模型 | 时间轴 | 金额 | 可搜文本 |
|---|---|---|---|---|
| 工作账本 | `Entry` | `occurredAt` | `amountCents` | 备注、类别 |
| 普通账本 | `GeneralEntry` | `occurredAt` | `amountCents` | 备注、类别、标签 |
| 旅游账本 | `TripExpense` | `occurredAt` | `amountBaseCents` | 标题、备注、类别 |
| 桃源账本 | `Event` | `createdAt` | 见下 | 标题、正文、备注、奖励、话题 |

**「条件对某个来源不适用」时整体跳过该来源**，而不是忽略条件照查不误 ——
后者会让用户筛「收入」却搜出一堆支出。具体：旅游支出恒为支出（筛收入时跳过）、
桃源活动没有类别（按类别筛时跳过）、工作与旅游没有标签（按标签筛时跳过）。
桃源活动的金额语义定为「**有任意一笔阶段金额**落在区间内」—— 它的预测/公示/到账
是三个阶段，没有单一金额字段，这是唯一能用一条 Prisma 查询表达的语义。

**分页**：每个来源各取 `limit+1` 条，再归并排序裁剪。等价于「四张表 UNION 后排序」，
但不需要写 SQLite 下 Prisma 表达不了的原生 UNION，也不用维护物化搜索表。
排序键与游标严格一致（`时间 desc, id desc`），不一致会导致翻页漏记录或重复。

几个刻意的取舍：

- **一个条件都没有时返回空并给提示**，不把整个库倒出来 —— 用户刚打开页面还没输入，
  不该触发四张全表扫描
- 回收站里的账本不参与搜索 —— 搜到一条点进去发现账本已删除，体验很差
- 前端请求带自增序号，慢的旧请求回来时丢弃，避免「输入 abc 却显示 ab 的结果」

**验证**：29 个单测覆盖参数解析（日期补全到当天末尾、金额边界、无效来源回退、
非法输入报错而非静默忽略）与跨来源归并（时间相同时按 id 倒序、游标裁剪）；
23 项真实 HTTP 冒烟跑在**专门新建的干净账号**下 —— 关键字跨账本命中、金额闭区间
边界、起止同一天、类别/标签/方向、限定来源、时间倒序、翻页无重叠、五类非法参数
400、未登录 401。另外单独验证了**跨用户隔离**：两个账号各造一条带独有暗号的记录，
互相搜不到，按对方的金额筛也搜不到。

> 冒烟脚本第一版跑在共用账号上，被上几轮残留的数据污染，三条断言失败看起来像
> 产品 bug，实际是测试设计问题。**断言全局条数的测试必须跑在干净账号下。**

### 2.15 统计图表页

原 [4.2 A 层](#42-功能--a-层)的第三项。新增 `/stats`：月度收支趋势双折线、
支出/收入构成占比、环比与同比、月均支出。四个账本一起算，桃源账本**只把已到账的
钱计入收入**（预测和公示都还没落袋，混进去会让收入虚高）。

**图表用内联 SVG 手画，不引图表库** —— 两条折线不值得加 100KB 依赖，
与项目其它地方的取舍一致。金额受全局「隐藏金额」开关控制，但**折线形状照常显示**：
趋势本身不算敏感，藏掉形状这图就没意义了。

**为什么这里在 JS 里分桶，而列表页坚持 SQL 聚合**：列表页的记录数无上界，
统计页只看最近 13 个月且只取三列。而按月分桶要下推到 SQL 得写
`strftime('%Y-%m', occurredAt/1000, 'unixepoch')` —— 那个除以 1000 依赖
「Prisma 在 SQLite 上把 DateTime 存成毫秒整数」这个内部约定，换个存储格式就会
静默算错月份。用有界窗口换掉这个隐患是划算的。

几个刻意的细节：

- 取 13 个月而不是 12：同比要拿去年同月垫底，界面只画最近 12 个月
- **同比在「去年同月一条记录都没有」时显示「还没满一年」而不是「—」**。
  这是冒烟测试逼出来的改动：原实现固定传 13 个桶，`yearOverYear` 永远不返回
  null，去年无数据时两项都算成 null 显示成两个「—」，读起来像"算过了但算不出"，
  而事实是"没得算"
- 月均支出只按**有记录的月份**摊 —— 否则新用户用了 2 个月却被 12 个月摊薄
- 百分比不做凑整到 100：宁可显示 99.9%，也不为凑数改掉某一项
- 没有记录的月份也要出现在折线上（值为 0），否则视觉上看不出"那个月没花钱"

**验证**：29 个单测覆盖月份键生成（含「3 月 31 日往前推一个月」这个 JS Date 陷阱）、
分桶、占比与「其他」合并、环比同比的除零处理、月均摊薄；10 项真实 HTTP 冒烟在
干净账号下核对 SSR 出来的聚合结果 —— 跨月累加后的类别占比（58.3% / 41.7%）、
收入构成 100%、环比 ↑400%、同比数据不足的文案、金额默认隐藏、空账号引导文案、
未登录跳转。

### 2.16 银行卡备份（加密存储）

原 [4.3](#43-功能--银行卡备份加密存储)。新增 `/cards` 页、`BankCard` 模型与
`lib/cardCrypto.ts`（AES-256-GCM，密钥由 `CARD_SECRET` 派生）。

**威胁模型说清楚：这一层防的是数据库文件泄露。** `app.db` 会被备份、被 `cp`
到别的机器、可能进了某个网盘，卡号明文躺在里面不可接受。它**防不住应用被攻破**
—— 进程里既有密钥又有数据，这不是本层的目标，也不该假装能防。所以
`CARD_SECRET` 必须与数据库分开保管，绝不要写进 `.env` 再和 `app.db` 一起打包。

几条硬性规则：

- **schema 里根本没有 CVV 和取款密码字段**。它们不是"加密后就能存"的东西，
  支付行业规范明确禁止存储 CVV。从结构上不给字段，就杜绝了以后有人顺手加一个
- **没配 `CARD_SECRET` 就是功能未启用，不降级成明文** —— 降级会让用户以为存的是
  加密的。列表和写入都返回 503 并说明怎么开
- 每条记录用独立随机 IV（GCM 下 IV 重用会直接暴露明文异或值）
- 密文自带 `v1$` 版本前缀 —— 密码哈希那边吃过没版本号的亏，这次一开始就带上
- 尾号明文单独存：列表页显示打码卡号不必解密，少一次搬运就少一分泄露面
- 查看完整卡号要**二次输入登录密码**（会话有效 ≠ 此刻坐在设备前的是本人），
  走 `requireVerifiedUser` 校验 sessionVersion，响应带 `no-store`，前端 60 秒自动隐藏
- 卡号校验**刻意不做 Luhn** —— 虚拟卡/储值卡不一定满足，为"格式正确"把用户真实
  持有的卡拒之门外是本末倒置

`cardFormat.ts` 与 `cardCrypto.ts` 拆开：前者是客户端安全的纯函数，后者依赖
`env.ts`。卡片列表是客户端组件，直接 import 加密模块会把服务端模块拖进客户端包
—— 项目在 `PresetPicker → currency → prisma` 那条链上踩过一次（2.9 Bug #4）。

**验证**：13 个单测覆盖卡号规整、长度/字符集校验、打码、后四位边界；
20 项真实 HTTP 冒烟 —— 创建/列表/解密/删除、密码错误 403、跨用户 404、
未登录 401、三类非法卡号 400；另外单独验证未配 `CARD_SECRET` 时列表与写入
都返回 503。

> **核心保证是直接 grep 数据库文件验的**：明文卡号、明文备注、带空格的原始输入
> 形式在文件里都搜不到，而尾号与 `v1$<iv>$<密文>` 能搜到。
>
> 这里踩了一个会给出**虚假信心**的坑：应用开了 WAL，刚写入的行还在 `-wal` 文件里
> 没 checkpoint 进主库。第一版只搜主库，"搜不到明文"是因为那行压根不在里面 ——
> 什么都没证明。现在搜索范围含 WAL，并且**先断言"这条记录确实在搜索范围内"**
> 再断言"搜不到明文"。

---


## 四、待做

### 4.1 性能（第四部分剩余）

| 项 | 说明 |
|---|---|
| ~~上传前图片压缩~~ | ✅ 已完成，见 [2.13 上传前图片压缩](#213-上传前图片压缩) |
| 拆分大文件 | `GeneralView.tsx` 约 1150 行、含 6 个组件；`TripExpenseModal.tsx` 约 480 行。改一个 modal 整个 chunk 要重新下载 |
| 缓存分层复核 | 所有页面都 `force-dynamic`，配合已完成的聚合优化后可以重新评估 |

### 4.2 功能 · A 层（原评估价值最高）

| 项 | 说明 |
|---|---|
| ~~**全量 JSON 导入还原**~~ | ✅ 已完成，见 [2.12 全量 JSON 导入还原](#212-全量-json-导入还原) |
| ~~**搜索与筛选**~~ | ✅ 已完成，见 [2.14 跨账本全局搜索](#214-跨账本全局搜索) |
| ~~**统计图表页**~~ | ✅ 已完成，见 [2.15 统计图表页](#215-统计图表页) |
| **周期记账** | 房租、订阅、工资这类固定项，配置一次自动生成或到期提醒确认 |
| ~~自助改密码~~ | ✅ 已完成，见 2.3 |

### 4.3 功能 · 银行卡备份（加密存储）

✅ **已完成**，见 [2.16 银行卡备份](#216-银行卡备份加密存储)。

### 4.4 功能 · B 层

| 项 | 说明 | 风险 |
|---|---|---|
| **B7 账本共享协作** | `Ledger` 现在硬绑一个 `userId`，`TripMember.userId` 预留了应用内用户关联但没用起来。改成 `LedgerMember(ledgerId, userId, role)` 就能支持夫妻共同记账、旅游同伴各自记账 | **高**。要改动所有权限校验链路（约 15 处 `ownLedger` / `ensureOwn`）。建议单独一轮做，现在有单测和 CI 兜底会安全得多 |
| **B8 离线记账队列** | 已经是 PWA，但 `public/sw.js` 只缓存静态资源，断网完全不能记。用 IndexedDB 暂存 + 联网后补交 | 中 |
| **B9 账单导入** | 支付宝 / 微信账单 CSV 解析导入，比手动记账省事一个数量级 | 中 |
| **B10 预算升级** | 现在只有账本级月度总预算。加分类别预算、周预算、超支 Web Push 提醒 | 低 |
| ~~B6 账户/资产概念~~ | 你未选，跳过 | — |

### 4.5 功能 · C 层

| 项 | 说明 |
|---|---|
| **C11 旅游账本打磨** | 每日花费曲线、行程日历视图、成员「已结清」标记、结算单生成图片分享、多币种预算 |
| **C12 桃源账本打磨** | 截止日期提醒 / 日历视图、按 `topicTag` 统计收益、公示→到账超时预警 |
| ~~C13 工作账本~~ | ✅ 按类别累计统计卡片已完成（见 2.6）。**剩余**：回款提醒（`refundedAt` 已有字段但没有提醒）、按类别趋势 |
| **C14 普通账本打磨** | 快捷记账模板（常用组合一键记）、最近使用类别置顶、标签升级成独立表并可统计 |
| **C15 设置项** | 货币符号、字号、周起始日、**月起始日**（有人 15 号发薪就想按 15 号切月 —— 已完成的「本月边界服务端计算」为它铺好了路） |

### 4.6 代码整洁（第七部分剩余）

✅ **本节四项已全部完成，见 [2.11 代码整洁](#211-代码整洁)。**

| 项 | 说明 |
|---|---|
| ~~抽取统一的账本归属校验~~ | ✅ 见 2.11 |
| ~~统一 API 错误响应格式与状态码语义~~ | ✅ 见 2.11 |
| ~~`logger.ts` 全面接入~~ | ✅ 见 2.11 |
| ~~说明 `prisma/build-placeholder.db` 的用途~~ | ✅ 见 2.11 |
| ~~拆分 `GeneralView.tsx` / `TripExpenseModal.tsx`~~ | 归入 [4.1 性能](#41-性能第四部分剩余) |
| ~~`db.ts` 的 `opaqueRequire` 注释~~ | ✅ 已随 Bug #3 修复移除 |

---

## 五、验证与部署命令速查

### 本地验证

```bash
npm run verify        # typecheck + lint + 229 个单测，提交前跑
npm test              # 只跑单测
npm run build         # 生产构建（输出 standalone，Docker 用这个）
npm run format        # Prettier 格式化
```

> **`npm run build` 会真连数据库**，本地必须先有库，否则报
> `Error code 14: Unable to open the database file`。注意 Prisma 对 SQLite
> 相对路径是相对 `prisma/` 目录解析的，`file:./data/app.db` 实际落在
> `prisma/data/app.db`。
>
> 同样的原因，Docker 构建时 `Dockerfile` 给了
> `DATABASE_URL="file:./build-placeholder.db"`，于是 `prisma/` 下会多出一个
> **`build-placeholder.db`** —— 它是构建产物而非开发用库，空的、已被 `.gitignore`
> 忽略、也不会进运行镜像（runner 是独立的 `FROM` 阶段），可以随时删。

### 数据库

```bash
npx prisma migrate deploy                             # 应用迁移
npm run prisma:status                                 # 查看迁移状态
npm run prisma:baseline                               # 老库 baseline（只登记不执行）
npm run prisma:migrate -- --name 你的改动说明          # 改完 schema 后生成新迁移
```

### 环境变量

| 变量 | 用途 | 备注 |
|---|---|---|
| `DATABASE_URL` | 本地 / Docker 的 SQLite 路径 | Docker 用绝对路径 `file:/data/app.db` |
| `SESSION_SECRET` | 会话加密密钥 | **生产环境缺失或 < 32 字符直接拒绝启动** |
| `COOKIE_SECURE` | cookie 是否仅 HTTPS | HTTP 部署必须 `false` |
| `PASSWORD_KDF_ITERATIONS` | 密码哈希迭代次数 | 不设则用 OWASP 的 600000；CF 免费套餐需降到 15000 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY` / `R2_SECRET_KEY` / `R2_BUCKET` | 图片存到 S3 兼容对象存储 | **四个必须全填**才启用，否则走本地 `data/uploads/` |
| `SKIP_DB_MIGRATE` | 跳过容器启动时的迁移 | 手工修库时用 |
| `LOG_LEVEL` | 日志级别 | `debug` / `info` / `warn` / `error` |
| `CARD_SECRET` | 银行卡加密密钥 | **不配就是该功能未启用**（不会降级成明文）。至少 32 字符，`openssl rand -base64 32`。**与数据库分开保管** —— 和 app.db 放同一个备份包等于没加密 |
| `CARD_SECRET` | 银行卡加密密钥 | **功能未实现**，仅预留 |

### 部署前提醒

**合并到 `main` 会触发 GHCR 镜像构建。** 服务器 pull 之前先备份数据库：

```bash
cp ~/myaccountbook/data/app.db ~/backups/app-before-migrate.db
```

本轮引入了 `prisma migrate`，容器首次启动会把老库 baseline 掉并加三个字段
（`sessionVersion` / `failedLoginCount` / `lockedUntil`）。逻辑已验证，但第一次跑迁移留个后路总是对的。

另外 Dockerfile 的基础镜像从 `node:20-alpine` 升到了 `node:22-alpine`，
**本机没有 docker，这个改动未能本地验证**，第一次镜像构建的结果需要看 GHCR。
```
