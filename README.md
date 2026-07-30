# 心愿便利贴 · MyAccountBook

一个多账本 + 心愿记录 Web App，可作为 PWA 安装到手机主屏，作为原生应用使用。

- **工作账本**：每月一张卡片，点击月份 → 选类别 → 填金额 → 备注可选。
  - 预设进项：月工资 / 奖金 / 协同
  - 预设出项：房贷垫款 / 消费贷垫款 / 存款垫款
  - 支持自定义类别
- **桃源账本**：活动流水线 —— 发布 → 预测收入 → 公示奖金 → 到账，逐步推进，未到账不计入储蓄。
- **首页**：显示总储蓄（工作 + 桃源已到账），入口分别进两个账本。
- **多用户**：注册即用，会话基于加密 Cookie。
- **数据导出**：一键下载 CSV（BOM 版，Excel 直接打开中文正常）。
- **PWA**：iOS Safari "添加到主屏"、Android Chrome "安装" 后就是原生应用体验，离线也能查看。

技术栈：Next.js 15 (App Router) + Prisma + SQLite + Tailwind + iron-session。

---

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境
cp .env.example .env
# 编辑 .env，把 SESSION_SECRET 换成 openssl rand -base64 32 生成的值

# 3. 初始化数据库
#    注意：Prisma 对 SQLite 相对路径是**相对 prisma/schema.prisma 所在目录**解析的，
#    所以 DATABASE_URL="file:./data/app.db" 实际生成的是 prisma/data/app.db。
#    想放在项目根的 data/ 下就写 "file:../data/app.db"，或直接用绝对路径。
#    Docker 部署用的是绝对路径 file:/data/app.db，不受这个坑影响。
npx prisma migrate deploy

# 4. 启动
npm run dev
# 打开 http://localhost:3000
```

### 开发时的检查

```bash
npm run verify        # typecheck + lint + 单测，提交前跑一遍
npm test              # 只跑单测
npm run test:watch    # 改代码自动重跑
npm run format        # Prettier 格式化
```

单测只覆盖**纯函数**（`src/**/*.test.ts`），重点是直接决定钱数对不对的那几个：
`splitAllocation`（分摊守恒）、`settlement`（结算守恒）、`tax`（档位边界）、
`money`（元分换算）、`pagination`（游标）、`passwordPolicy`、`imageSniff`。
涉及数据库和 Next 运行时的部分靠 `npm run build` 加真实请求验证。

CI（`.github/workflows/ci.yml`）在每次 push 和 PR 上跑同样这四道检查。

> **数据库变更走 migration，不要用 `db push`。**
> 改完 `prisma/schema.prisma` 后跑 `npm run prisma:migrate -- --name 你的改动说明`，
> 它会在 `prisma/migrations/` 下生成一份带版本的 SQL 并提交到 git。
> 服务器端由 `docker-entrypoint.sh` 自动跑 `migrate deploy` 增量应用。
> `npm run prisma:status` 可以查看当前数据库落后哪些迁移。

首次访问会跳到 `/register` 注册第一个账号。

---

## 一键 Docker 部署到服务器

**思路**：GitHub Actions 自动构建镜像推到 GHCR（GitHub Container Registry），服务器只需 `docker compose pull && docker compose up -d` 即可拉起最新版本。

### A. 一次性准备：GitHub 端（约 3 分钟）

1. **推代码到 GitHub**（首次）

   ```bash
   cd MyAccountBook
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/MyAccountBook.git
   git push -u origin main
   ```

2. **允许 Actions 写包**（GitHub 网页）
   - 打开仓库 → Settings → Actions → General
   - `Workflow permissions` 选 **Read and write permissions**，保存

3. **推送后自动构建**
   - `.github/workflows/docker-publish.yml` 会在每次 push 到 `main` 时自动构建 amd64 + arm64 镜像并推到 GHCR
   - 构建完成后在 `https://github.com/<你的用户名>?tab=packages` 能看到 `myaccountbook` 包
   - 包默认是 private，去 package 页面 → Package settings → Change visibility → Public（推荐，之后服务器不用登录 GHCR）

4. **编辑 `docker-compose.yml`**：把 `image` 里的 `snail46` 改成你自己的 GitHub 用户名（**小写**！GHCR 强制小写）。提交推送即可。

### B. 服务器端：一次性准备（约 5 分钟）

假设服务器是 Ubuntu / Debian，用 root 或 sudo 用户操作：

1. **装 Docker + Docker Compose 插件**

   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo apt install -y docker-compose-plugin
   sudo usermod -aG docker $USER
   # 重登一下让组生效
   ```

2. **创建部署目录并拉取 compose 文件**

   ```bash
   mkdir -p ~/myaccountbook && cd ~/myaccountbook
   curl -O https://raw.githubusercontent.com/<你的用户名>/MyAccountBook/main/docker-compose.yml
   ```

3. **生成会话密钥并写入 `.env`**

   ```bash
   cat > .env <<EOF
   SESSION_SECRET=$(openssl rand -base64 32)
   COOKIE_SECURE=false
   EOF
   chmod 600 .env
   ```

4. **（可选，包设成 private 时）登录 GHCR**

   ```bash
   # 在 GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   # 生成一个只勾 read:packages 权限的 token
   echo <YOUR_GHCR_TOKEN> | docker login ghcr.io -u <你的用户名> --password-stdin
   ```

### C. 服务器端：启动服务（10 秒）

```bash
cd ~/myaccountbook
docker compose pull
docker compose up -d
docker compose logs -f
```

看到 `Ready in ...ms` 就是起来了。浏览器访问 `http://<服务器IP>:3000` 即可注册使用。

### D. 后续更新（每次 push 后）

```bash
cd ~/myaccountbook
docker compose pull
docker compose up -d
```

数据保存在 `~/myaccountbook/data/app.db`，容器重建不丢数据。

> **从 v1（`db push` 时代）升级上来的部署无需任何手工操作。** 容器启动时会检测到
> 老数据库、自动把初始迁移 baseline 掉（只登记不改表），之后只增量应用新迁移。
> 完成后 `data/` 下会多一个 `.prisma-baselined` 标记文件，**不要删它**。
> 万一需要跳过自动迁移（例如手工修数据库），用 `SKIP_DB_MIGRATE=true` 启动。

### E.（推荐）加 HTTPS + 域名

PWA 在非本地环境**必须** HTTPS 才能安装到主屏。用 Nginx + Certbot 一次性搞定：

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# 建反代配置
sudo tee /etc/nginx/sites-available/myaccountbook <<'EOF'
server {
    listen 80;
    server_name your.domain.com;

    client_max_body_size 4M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/myaccountbook /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 申请证书
sudo certbot --nginx -d your.domain.com
```

完成后手机浏览器打开 `https://your.domain.com`：
- **iOS Safari**：分享 → 添加到主屏
- **Android Chrome**：菜单 → 安装应用

---

## Cloudflare Pages 部署（Serverless · 全球 CDN · 免运维）

除了 Docker 自建，本项目也支持部署到 **Cloudflare Workers** —— 全球边缘节点秒开、免维护。数据库切换到 **Turso**（远端 SQLite）、图片走 **R2**（S3 兼容对象存储），Prisma schema 和业务代码完全复用。

> ### ⚠️ 免费套餐要降低密码哈希强度（安全妥协）
>
> Workers **免费套餐每次调用的 CPU 上限是 10ms**，而合格的密码哈希本质上
> 就是"故意烧 CPU"。本机实测：
>
> | 方案 | CPU 耗时 |
> |---|---|
> | PBKDF2-SHA256 600,000 次（OWASP 推荐，本项目默认） | 237 ms |
> | PBKDF2-SHA256 20,000 次 | 8 ms |
> | PBKDF2-SHA256 15,000 次 | 6 ms |
>
> **10ms 预算内做不到强度合格的密码哈希，这是硬限制，没有绕过的技巧。**
> 所以 `wrangler.toml` 里把 `PASSWORD_KDF_ITERATIONS` 设成了 `15000` ——
> 能跑，但强度远低于推荐值。个人账本 + 强密码策略（≥8 位、拒弱口令）下
> 可以接受，但要清楚这是妥协。
>
> 换到**付费套餐**（30s CPU）后，删掉 `wrangler.toml` 里那一行即可回到 600000，
> 已有用户的密码会在下次登录时自动按新强度重算，无需重置。

部署有两条路，选一条：

| | 方式一：网页全图形化 | 方式二：本地命令行 |
|---|---|---|
| 建 Worker | 面板里连 GitHub 仓库，Cloudflare 自己构建 | `npm run deploy:cf` |
| 每次更新 | **push 到分支就自动重新部署** | 手动再跑一次 deploy |
| 建数据库表 | 粘贴一段 SQL 到 Turso 面板 | `npm run turso:migrate` |
| 填密钥 | 面板表单里输入 | `npx wrangler secret put` |
| 需要本地装东西 | **不需要** | 需要 Node + wrangler |

**方式一（网页全图形化）写在下面「方式一」小节；方式二在其后。**

---

## 方式一：全程在网页上操作（推荐，不碰命令行）

### 第 1 步 · 建 Turso 数据库

1. 打开 <https://turso.tech>，用 GitHub 账号登录
2. 左侧 **Databases** → 点 **Create Database**
   - **Name** 填 `myaccountbook`
   - **Region** 选离你近的，例如 `Tokyo (nrt)` 或 `Singapore (sin)`
   - 点 **Create**
3. 点进这个数据库，把两样东西抄到记事本里备用：
   - **Database URL** —— 形如 `libsql://myaccountbook-你的用户名.turso.io`
   - **Token** —— 页面上找 **Generate Token**（权限选 Read & Write），
     形如 `eyJhbGciOi...`。**只显示一次，务必先复制**

### 第 2 步 · 建表（粘贴 SQL，不用命令行）

1. 在 GitHub 上打开本仓库的 **[`prisma/turso-setup.sql`](prisma/turso-setup.sql)**
2. 点右上角的 **Copy raw file**（复制整个文件）
3. 回到 Turso 面板，进入你刚建的数据库 → 找 **SQL Console / Shell** 标签
4. 把内容**整段粘贴**进去，执行
5. 验证：在同一个控制台里执行

   ```sql
   SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
   ```

   应该看到 `CurrencyRate` `Entry` `Event` `EventAmount` `GeneralEntry`
   `Ledger` `TripExpense` `TripMember` `TripSplit` `User`
   以及 `_prisma_migrations` 共 11 张表。

> 这个文件是从 `prisma/migrations/` 自动生成的，已经把迁移记录一并写好，
> 以后用命令行工具检查也能对上。**只在全新的空库上执行一次。**

### 第 3 步 · 在 Cloudflare 面板创建 Worker（连 GitHub）

1. 打开 <https://dash.cloudflare.com> → 左侧 **Workers 和 Pages**
2. 点 **创建** → 选 **Workers** 那一栏的 **导入存储库**
   （英文界面：**Create** → **Workers** → **Import a repository**）
   - 如果是第一次用，会让你授权 Cloudflare 访问 GitHub，按提示装 GitHub App，
     授权范围选 `snail46/MyAccountBook` 这一个仓库即可
3. 选中 `MyAccountBook` 仓库，进入配置页，按下表填：

   | 字段 | 填什么 |
   |---|---|
   | **项目名称 / Project name** | `myaccountbook` |
   | **生产分支 / Production branch** | 要部署的那个分支名（**见下方警告**） |
   | **安装命令 / Install command** | `npm ci` |
   | **构建命令 / Build command** | `npm run build:cf` |
   | **部署命令 / Deploy command** | `npx wrangler deploy` |
   | **根目录 / Root directory** | 留空 |

   > #### ⚠️ 两个必踩的坑
   >
   > **一、生产分支必须填真正含有这些改动的分支。**
   > Cloudflare 只构建你指定的那个分支。如果 CF 部署所需的
   > `@opennextjs/cloudflare` / `wrangler` 还没合进 `main`，却把生产分支填了
   > `main`，构建会在最后一步失败：
   >
   > ```
   > sh: 1: opennextjs-cloudflare: not found
   > ```
   >
   > 怎么确认是这个原因：看构建日志里 `bun install` / `npm ci` 之后打印的
   > 依赖列表，如果里面没有 `@opennextjs/cloudflare`，就是分支选错了。
   >
   > **二、安装命令要显式写 `npm ci`。**
   > 分支上没有 `package-lock.json` 时，Cloudflare 会退回用 `bun install`，
   > 而 bun 默认拦截 postinstall 脚本（日志里会看到
   > `Blocked 1 postinstall`）。本项目有 6 个包带安装脚本，
   > 其中 `esbuild` 是 `@opennextjs/cloudflare` 打包时要用的，
   > 被拦掉就会构建失败。写死 `npm ci` 既能避开这个问题，
   > 也保证装的版本与 `package-lock.json` 一致。

4. **先不要点部署** —— 在同一页面往下找 **环境变量 / Environment variables**，
   或建完后去 **Settings → Variables and Secrets** 添加。见下一步。

### 第 4 步 · 填密钥（面板表单，类型选 Secret）

在 Worker 的 **Settings（设置）→ Variables and Secrets（变量和机密）** 里
点 **添加**，逐条加入。**类型一定要选 `Secret`（加密）而不是 `Text`**：

| 名称 | 值 | 怎么来 |
|---|---|---|
| `SESSION_SECRET` | 32 字符以上随机串 | 见下方 |
| `TURSO_DATABASE_URL` | `libsql://myaccountbook-xxx.turso.io` | 第 1 步抄的 |
| `TURSO_AUTH_TOKEN` | `eyJhbGciOi...` | 第 1 步抄的 |

**`SESSION_SECRET` 怎么生成（不用命令行）**：
在浏览器里按 <kbd>F12</kbd> 打开开发者工具，切到 **Console**，粘贴执行：

```js
btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
```

复制输出的那串字符（含引号的话去掉引号）。

> `NODE_ENV`、`COOKIE_SECURE`、`PASSWORD_KDF_ITERATIONS` 这三个
> **不用填** —— 已经写在仓库的 `wrangler.toml` 里，部署时自动带上。

### 第 5 步 · 部署

回到 Worker 页面点 **部署 / Deploy**（或 **重试部署 / Retry deployment**）。
Cloudflare 会自己 `npm ci` → `npm run build:cf` → `npx wrangler deploy`。

构建日志在 Worker 页面的 **部署 / Deployments** 标签里能看到全过程。
第一次大约 2–4 分钟。

成功后会给你一个地址，形如
`https://myaccountbook.你的subdomain.workers.dev`。

### 第 6 步 · 验证并注册

1. 浏览器打开 `你的地址/api/health`
   - `{"status":"ok","db":"ok",...}` → 数据库通了 ✓
   - `{"status":"degraded","db":"error"}` → Turso 那两个密钥填错了，回第 4 步核对
2. 打开 `你的地址/register` 注册第一个账号
   - 新库里 0 用户时自助注册开放，**第一个账号自动成为管理员**
   - 密码要求：≥8 位，不能是常见弱口令、不能含用户名、不能是连续数字字母

**注册能成功，就说明 15000 次哈希迭代挤进了免费版的 10ms CPU 预算。**
若报 CPU 超限，改仓库里 `wrangler.toml` 的
`PASSWORD_KDF_ITERATIONS = "10000"`，push 后会自动重新部署。

### 第 7 步 · 图片上传（可选，跳过也能用）

不配 R2 只影响「上传小票 / 活动图片」，其它功能全正常。要启用：

1. Cloudflare 面板 → **R2** → **创建存储桶**，名字填 `myaccountbook-uploads`
2. **Account ID**：在 R2 页面右侧栏，或 Workers 概览页右侧，32 位十六进制
3. R2 页面 → **管理 R2 API 令牌** → **创建 API 令牌**
   - 权限选 **对象读和写**
   - 创建后记下 **Access Key ID** 与 **Secret Access Key**（只显示一次）
4. 回 Worker 的 **Variables and Secrets**，再加四条 Secret：
   `R2_ACCOUNT_ID`、`R2_ACCESS_KEY`、`R2_SECRET_KEY`、
   `R2_BUCKET`（值填 `myaccountbook-uploads`）

密钥保存后立即生效，不用重新部署。

### 以后怎么更新

**push 到生产分支就自动重新部署**，什么都不用做。
在 Worker 的 **Deployments** 标签能看每次构建的日志，出错也能一键回滚到上一版。

### 把 Docker 上的存量数据搬到 Turso

已经在 Docker 上用出数据了，想搬到 Worker 版这边 —— 用
`scripts/copy-to-turso.mjs`。它逐表复制行，**密码哈希一并搬过去，
用户用原来的密码就能登录**（旧的 bcrypt 哈希会在首次登录时自动升级成 PBKDF2）。

> **为什么不用「导出 JSON → 导入还原」**：`/api/export/json` 刻意
> **不导出密码哈希**（备份文件在用户手里，不该带哈希），用它还原所有人都得
> 重设密码。而且导入端还没做。两边都是 SQLite 的情况下直接搬行更合适。

**第 1 步 · 把数据库文件从服务器拷到本地**

数据库就一个文件。服务器上先停机保证一致性，再拷出来：

```bash
cd ~/myaccountbook
docker compose stop
cp data/app.db /tmp/app.db
docker compose start
```

然后从本地把 `/tmp/app.db` 拉下来。不想敲命令的话用
[WinSCP](https://winscp.net/)（图形化 SFTP 客户端）连服务器直接拖文件。

> 停机是为了避免拷到写入一半的状态。WAL 模式下正在运行时直接拷 `app.db`
> 可能漏掉 `-wal` 里还没合并的事务。

**第 2 步 · 确认目标库已建表但还没数据**

如果你已经在 Worker 上注册过账号，Turso 里就有数据了。搬之前需要清空 ——
在 Turso 面板的 SQL 控制台执行：

```sql
DELETE FROM "TripSplit";     DELETE FROM "TripExpense";
DELETE FROM "TripMember";    DELETE FROM "GeneralEntry";
DELETE FROM "EventAmount";   DELETE FROM "Event";
DELETE FROM "Entry";         DELETE FROM "Ledger";
DELETE FROM "User";          DELETE FROM "CurrencyRate";
```

（顺序是照外键依赖来的，反了会报错。`_prisma_migrations` 不要删。）

**第 3 步 · 搬**

```powershell
$env:SOURCE_DB          = "C:/Users/你/Downloads/app.db"
$env:TURSO_DATABASE_URL = "libsql://myaccountbook-xxx.turso.io"
$env:TURSO_AUTH_TOKEN   = "eyJhbGc..."

npm run turso:copy -- --dry-run   # 先看会搬多少行，不写入
npm run turso:copy                # 真正搬
```

脚本会：

- 只搬**两边都有的列** —— 老版本 Docker 库没有 `sessionVersion` /
  `failedLoginCount` / `lockedUntil`，这三列交给目标库的默认值
- `Event` 的合并关系（自引用 `parentId`）分两遍处理，先插入再回填，
  避免父活动还没插入就触发外键错误
- 搬完逐表核对行数，不一致就报错退出
- 目标库已有用户时拒绝执行（除非加 `--force`）

**第 4 步 · 图片（如果你用过上传功能）**

图片不在数据库里，在 Docker 的 `data/uploads/`。要让历史记录里的图片能显示，
得把这个目录整体上传到 R2 桶，保持原有的路径结构。
Cloudflare 面板的 R2 页面支持直接拖拽上传文件夹。

不搬图片的话，其它数据完全正常，只是老记录里的图片位置显示空白。

### 构建失败对照表

| 日志里的报错 | 原因 | 怎么修 |
|---|---|---|
| `opennextjs-cloudflare: not found` | 生产分支选的是还没含 CF 依赖的分支 | 改生产分支，或把改动合进 `main` |
| `Blocked N postinstall` 后构建失败 | 用了 `bun install`，postinstall 被拦 | 安装命令写死 `npm ci` |
| `Missing entry-point to Worker script` | `wrangler.toml` 缺 `main` / `[assets]` | 本仓库已配好，检查有没有被改动 |
| 页面 500、日志提 `SESSION_SECRET` | 密钥没填或短于 32 字符 | 回第 4 步，注意类型要选 **Secret** |
| `/api/health` 返回 `degraded` | Turso 两个密钥不对 | 回第 4 步核对 URL 与 Token |
| `Worker exceeded CPU time limit` | 免费套餐哈希迭代太高 | `wrangler.toml` 改 `PASSWORD_KDF_ITERATIONS = "10000"` |

---

## 方式二：本地命令行部署

### A. 建数据库（Turso 网页版，不需要装 CLI）

Turso 的 CLI 在 Windows 上要 WSL，直接用网页版更省事。

1. 打开 <https://turso.tech> 注册/登录（可以用 GitHub 账号）
2. 左侧 **Databases** → **Create Database**
   - Name 填 `myaccountbook`
   - Region 选离你近的（如 `Tokyo` / `Singapore`）
3. 进入刚建的库，抄下两样东西：
   - **Database URL**：形如 `libsql://myaccountbook-你的用户名.turso.io`
   - **Token**：同页面找 **Generate Token**（权限 Read & Write），
     形如 `eyJhbGc...`。**只显示一次，务必先复制**

### B. 把表结构灌进去

⚠️ **不要用 `prisma migrate deploy`** —— Prisma CLI 不认 `libsql://` 协议，会报
`P1012 the URL must start with the protocol file:`（driver adapter 只在运行时生效）。
用项目自带的脚本，它内部用 `@libsql/client`，跨平台且维护与 Prisma 互认的
`_prisma_migrations` 记录。

PowerShell：

```powershell
$env:TURSO_DATABASE_URL = "libsql://myaccountbook-你的用户名.turso.io"
$env:TURSO_AUTH_TOKEN   = "eyJhbGc..."

npm install --no-save @libsql/client   # 脚本只依赖这一个包
npm run turso:migrate
```

bash / WSL：

```bash
export TURSO_DATABASE_URL="libsql://myaccountbook-你的用户名.turso.io"
export TURSO_AUTH_TOKEN="eyJhbGc..."
npm install --no-save @libsql/client
npm run turso:migrate
```

看到每个迁移后面跟 `ok`、末尾 `✓ 完成` 就成了。随时可以复查：

```powershell
npm run turso:status
```

脚本是幂等的，重复跑只会说「无需操作」。

> **如果这个 Turso 库是 v1 时期用 `db push` 建的**（表已存在），
> 直接跑会报 `already exists`。改用只登记不执行：
>
> ```powershell
> npm run turso:baseline
   > ```

### C. 装工具链并登录

```powershell
npm install --no-save @opennextjs/cloudflare wrangler @libsql/client @prisma/adapter-libsql
npx wrangler login
```

`wrangler login` 会弹浏览器让你授权，点同意后回到终端即可。用
`npx wrangler whoami` 可以确认已登录。

> 项目里也有个 `npm run cf:setup` 做同样的事，但它用的是 `npm i -D`，
> **会把这 4 个包写进 `package.json` 和 `package-lock.json`** ——
> 提交后 Docker 构建的 `npm ci` 也会装这批 CF 专用包，镜像白白变大。
> 所以推荐上面的 `--no-save` 写法。

### D. 首次部署（先建 Worker，再灌 secrets）

**顺序很重要**：`wrangler secret put` 需要 Worker 已存在，所以先部署一次。
这次部署起来的应用会因为缺 `SESSION_SECRET` 而报错，属于预期。

```powershell
npm run build:cf
npm run deploy:cf
```

输出里会给出访问地址，形如
`https://myaccountbook.你的subdomain.workers.dev` —— 记下来。

然后生成会话密钥。Windows 上没有 `openssl`，用 node 代替：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

把输出复制好，逐条写入三个 secret（每条命令会提示你粘贴值，粘贴后回车）：

```powershell
npx wrangler secret put SESSION_SECRET
```

```powershell
npx wrangler secret put TURSO_DATABASE_URL
```

```powershell
npx wrangler secret put TURSO_AUTH_TOKEN
```

secret 写完立即生效，不用重新部署。打开访问地址，应该能进 `/login`；
第一次用请访问 `/register` 注册 —— 新库里 0 用户时自助注册开放，
**首个账号自动成为管理员**。

自查一下（把 URL 换成你的）：

```powershell
curl.exe https://myaccountbook.你的subdomain.workers.dev/api/health
```

返回 `{"status":"ok","db":"ok",...}` 说明数据库通了。若是
`{"status":"degraded","db":"error"}`，就是 Turso 的两个 secret 没配对。

### E. 加图片上传（R2，可选）

不配 R2 的话，除了「上传小票/活动图片」之外一切正常。想启用：

1. Cloudflare 面板 → **R2** → **创建存储桶**，名字填 `myaccountbook-uploads`
2. **Account ID** 在 R2 页面右侧，或 Workers 概览页右侧栏，形如 32 位十六进制
3. R2 页面 → **管理 R2 API 令牌** → **创建 API 令牌**
   - 权限选 **对象读和写**（Object Read & Write）
   - 创建后记下 **Access Key ID** 和 **Secret Access Key**（只显示一次）
4. 写入四个 secret：

```powershell
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY
npx wrangler secret put R2_SECRET_KEY
npx wrangler secret put R2_BUCKET
```

`R2_BUCKET` 填桶名 `myaccountbook-uploads`。

### F. 本地预览（可选，用真实 Workers 运行时）

```powershell
npm run preview:cf
```

在 `http://localhost:8787` 跑的是 workerd —— 和线上同一个运行时。
注意 `wrangler.toml` 里 `COOKIE_SECURE = "true"`，本地是 http 所以浏览器会
拒收登录 cookie；想在本地测登录，临时把它改成 `"false"`，**别提交这个改动**。

### 关于 `wrangler.toml`

`main` 和 `[assets]` 是**必填项**，指向 `build:cf` 的产物。
`@opennextjs/cloudflare` 不会自动写进去，缺了会报
`Missing entry-point to Worker script or to assets directory`。

预览时可以这样自查（不需要 Turso 也能验证大半）：

```bash
curl -sI http://localhost:8787/login | grep -i -E 'content-security-policy|x-content-type'
curl -s http://localhost:8787/api/health
```

`/api/health` 在没配 Turso 时应返回 `503 {"status":"degraded","db":"error"}` ——
这恰好证明它做了真实的数据库往返，而不是只回一句 ok。

### D. 后续更新

改代码 → `npm run deploy:cf` 即可。数据库和 R2 是独立服务，Worker 更新不影响存量数据。

### 与 Docker 版本共存

代码通过环境变量自动判断走本地 SQLite/文件系统还是 Turso/R2：

| 环境变量存在 | 数据库 | 图片 |
|---|---|---|
| （都没设） | 本地 SQLite (`data/app.db`) | 本地文件系统 (`data/uploads/`) |
| `TURSO_DATABASE_URL` | Turso 远端 SQLite | ↑ |
| `R2_ACCOUNT_ID` 等 | ↑ | Cloudflare R2 |

同一份代码可以同时跑 Docker（内网/自建服务器）和 CF（对外公开），完全不互相干扰。

---

## 数据备份

数据只有一个 SQLite 文件，备份 = 复制：

```bash
# 手动备份
cp ~/myaccountbook/data/app.db ~/backups/app-$(date +%F).db

# 定时备份（crontab -e）
0 3 * * * cp ~/myaccountbook/data/app.db ~/backups/app-$(date +\%F).db && find ~/backups -mtime +30 -delete
```

App 内也提供 **导出 CSV** 按钮供随时下载。

---

## 用户管理

**自助注册默认关闭**（安全默认）：只有当数据库里 0 个用户时，`/register` 才开放 —— 让你注册第一个账号，这个账号自动成为**管理员**。之后新账号只能由管理员在应用里创建。

- 首页登录后，如果你是管理员，会看到 **"用户管理"** 入口
- 在 `/admin` 里可以新建用户 / 重置密码 / 升降级 / 删除
- 已注册的老用户不受影响，密码/账本数据都保留
- 管理员不能删除自己，且系统至少保留一个管理员
- 普通用户在首页有 **"修改密码"** 入口，不用再找管理员

---

## 安全说明

- **密码策略**：至少 8 位，拒绝常见弱口令、含用户名、纯连续数字/字母、单字符重复。
  刻意不强制"大写+数字+符号"——那只会逼出 `Password1!` 这类又难记又好猜的密码。
- **登录限流**：按用户名累计连续失败，5 次锁 1 分钟、10 次锁 5 分钟、15 次锁 15 分钟、
  20 次锁 1 小时，成功即清零。用递增锁而非永久锁，避免知道用户名就能把人锁在门外。
- **会话失效**：改密码或管理员重置密码后，其它设备上已签发的 cookie 立即作废
  （靠 `User.sessionVersion` 校验），当前设备换发新会话不被踢下线。
- **CSRF**：所有写操作校验 `Origin`/`Referer` 同源，缺失即拒绝。
- **CSP**：`middleware.ts` 为每个请求生成 nonce，脚本白名单为 `'self' + nonce + strict-dynamic`，
  没有 `unsafe-inline`。同时下发 `nosniff` / `Referrer-Policy` / `Permissions-Policy` /
  `X-Frame-Options` / HSTS，并移除 `X-Powered-By`。
- **上传校验**：只认文件内容魔数（jpg/png/webp/gif），不信任客户端声明的 MIME；
  存储路径改为内容寻址 `<userId>/<yyyy-mm>/<sha256前24位>.<ext>`。
- **SESSION_SECRET**：生产环境缺失或短于 32 字符时**拒绝启动**。
- **密码哈希**：PBKDF2-SHA256，默认 600,000 次迭代（OWASP 推荐值），
  盐与迭代次数编码在哈希串内（`pbkdf2-sha256$<迭代>$<盐>$<派生>`）。
  用 `PASSWORD_KDF_ITERATIONS` 可调，改了**不会**让已有密码失效。
  早期的 bcrypt 哈希继续可验证，并在登录成功时自动升级到新格式 ——
  存量用户无需重置密码。比较派生结果时用定长时间比较。

**如果已有部署想启用管理员机制**：直接拉取最新镜像 `docker compose pull && docker compose up -d`，启动时会自动把最早注册的用户升为 admin，其它用户默认 role=user。

---

## 目录结构

```
├─ src/
│  ├─ app/
│  │  ├─ page.tsx           # 首页（总储蓄 + 入口）
│  │  ├─ login/, register/  # 认证页
│  │  ├─ work/              # 工作账本（月份卡片 + 记账流程）
│  │  ├─ taoyuan/           # 桃源账本（活动状态机）
│  │  └─ api/               # 认证 / 条目 / 活动 / 导出 API
│  ├─ lib/                  # db, session, auth, money, categories
│  └─ components/
├─ prisma/schema.prisma     # User / Entry / Event 模型
├─ public/                  # manifest.json, sw.js, 图标
├─ Dockerfile               # 多阶段构建，输出 standalone 镜像
├─ docker-compose.yml       # 服务器上一条命令拉起
├─ docker-entrypoint.sh     # 启动前 prisma db push 同步表结构
└─ .github/workflows/       # push main 自动构建推 GHCR
```

---

## 常见问题

- **镜像 pull 报 `denied`**：包还是 private，走 A.3 把 visibility 改成 Public，或走 B.4 用 PAT `docker login ghcr.io`。
- **访问显示 500 且日志报 `SESSION_SECRET`**：`.env` 里的密钥必须 ≥ 32 字符。
- **数据丢了**：检查 `docker compose down -v` 是不是删了 volume；日常 `down` / `up` 不会动 `./data`。
- **想改换端口**：改 `docker-compose.yml` 的 `ports: - "8080:3000"`，Nginx 也一起改。
- **iOS 装到主屏后打开是白屏**：清一次 Safari 缓存，或改动 `public/sw.js` 里的 `CACHE_NAME` 值触发 SW 更新。
