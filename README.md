# 心愿便利贴 · MyAccountBook

一个多账本 + 心愿记录 Web App，可作为 PWA 安装到手机主屏，作为原生应用使用。

- **工作账本**：每月一张卡片，点击月份 → 选类别 → 填金额 → 备注可选。
  - 预设进项：月工资 / 奖金 / 协同
  - 预设出项：房贷垫款 / 消费贷垫款 / 存款垫款
  - 支持自定义类别
- **桃源账本**：活动流水线 —— 发布 → 预测收入 → 公示奖金 → 到账，逐步推进，未到账不计入储蓄。
- **首页**：显示总储蓄（工作 + 桃源已到账），入口分别进两个账本。
- **普通账本**：日常收支，含月度预算、类别自定义、小票图片。
- **旅游账本**：多币种 + 多人 AA + 最优结算 + 趣味复盘报告。
- **多用户**：会话基于加密 Cookie，含登录限流与会话失效机制。
- **数据导出**：CSV（Excel 直接打开中文正常）覆盖全部账本；另有完整 JSON 备份。
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
   curl -O https://raw.githubusercontent.com/snail46/MyAccountBook/main/docker-compose.yml
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

> **从 v1（`db push` 时代）升级上来的部署无需任何手工操作。** 容器启动时先尝试
> `migrate deploy`，只要撞上 P3005（库里有表但没有迁移历史）就自动把初始迁移
> baseline 掉（只登记不改表）再重试，之后只增量应用新迁移。判据是数据库的真实
> 状态，所以事后替换 `app.db`（比如把生产库拷进预览实例）也能正常识别。
> 万一需要跳过自动迁移（例如手工修数据库），用 `SKIP_DB_MIGRATE=true` 启动。
>
> 早期版本用 `data/.prisma-baselined` 标记文件做判据，换过 `app.db` 之后会误判成
> 「已迁移」，导致 P3005 无限 crashloop。如果你的数据目录里还留着这个文件，删掉即可，
> 现在的逻辑不再读它。

### D2. 并行部署一个预览实例做对比

想在不动生产的前提下试新版本（比如某个功能分支），可以在同一台服务器上
跑第二个实例：**不同端口、不同容器名、不同数据目录**。

#### 第 1 步 · 让 Actions 构建分支镜像

默认只有 push 到 `main` 才会构建。功能分支要手动触发：

1. GitHub 仓库 → **Actions** 标签
2. 左侧选 **Build & publish Docker image**
3. 右上 **Run workflow** → **Branch** 下拉里选你要的分支 → 点 **Run workflow**
4. 等构建完成（约 5–10 分钟，要出 amd64 + arm64 两个架构）
5. 点进这次运行，**任务摘要里会直接列出可拉取的镜像标签**，复制即可

标签规则：分支名里的斜杠会变成短横线。例如
`refactor/data-safety-and-pagination` → `refactor-data-safety-and-pagination`。
另外总会有一个 `sha-xxxxxxx` 标签指向这次的确切提交，想固定版本用它更稳。

> `latest` 标签带 `enable={{is_default_branch}}` 守卫，**只有 `main` 会产出**。
> 所以手动构建分支不会影响生产实例的 `docker compose pull`。

#### 第 2 步 · 准备预览实例的目录与数据

```bash
mkdir -p ~/myaccountbook-preview && cd ~/myaccountbook-preview

curl -O https://raw.githubusercontent.com/snail46/MyAccountBook/main/docker-compose.preview.yml

cat > .env <<EOF
SESSION_SECRET=$(openssl rand -base64 32)
COOKIE_SECURE=false
IMAGE_TAG=refactor-data-safety-and-pagination
EOF
chmod 600 .env
```

想拿真实数据对比体验，就**复制**一份生产库过来（注意是复制，不是共用）：

```bash
mkdir -p ~/myaccountbook-preview/data-preview

cd ~/myaccountbook
docker compose stop           # 停一下保证文件一致，WAL 模式下热拷可能漏事务
cp data/app.db ~/myaccountbook-preview/data-preview/app.db
cp -r data/uploads ~/myaccountbook-preview/data-preview/ 2>/dev/null || true
docker compose start
```

不复制也行，预览实例会是个空库，首次访问 `/register` 注册第一个账号即可。

#### 第 3 步 · 启动

```bash
cd ~/myaccountbook-preview
docker compose -f docker-compose.preview.yml pull
docker compose -f docker-compose.preview.yml up -d
docker compose -f docker-compose.preview.yml logs -f
```

日志里会看到迁移过程：

```
[entrypoint] 应用数据库迁移...
Error: P3005
The database schema is not empty.
[entrypoint] 检测到 db push 时代的老数据库，baseline 到 0_init（不改表结构）后重试...
Migration 0_init marked as applied.
[entrypoint] 启动服务 (port 3000)...
```

那行 `Error: P3005` 是**预期输出** —— 它就是「这是个 db push 时代的老库」的判据，
紧跟着的 baseline + 重试才是结论。只有重试之后仍然失败，容器才会真的退出。

访问 `http://<服务器IP>:3001`。生产实例仍在 3000，两边互不干扰。

确认数据库通了：

```bash
curl http://127.0.0.1:3001/api/health
# {"status":"ok","db":"ok","latencyMs":1}
```

#### ⚠️ 两条务必注意

**一、绝对不要让两个实例共用同一个 data 目录。**
新版启动时跑 `prisma migrate deploy`，给库加三个字段
（`sessionVersion` / `failedLoginCount` / `lockedUntil`）；
而老版跑的是 `prisma db push --accept-data-loss`，它按老 schema 对齐，
会把那三个字段**直接删掉**。两个容器轮流启动 = 反复加列删列，
是实打实的数据损坏风险。`docker-compose.preview.yml` 里已经用
`./data-preview` 隔开了，别去改它。

**二、复制那一刻起两边数据就分叉了。**
在预览实例里记的账不会出现在生产，反之亦然。对比体验没问题，
但**不要**两边同时当正式账本用。

#### 对比完之后

不想要了，整个删掉：

```bash
cd ~/myaccountbook-preview
docker compose -f docker-compose.preview.yml down
cd ~ && rm -rf ~/myaccountbook-preview
```

觉得可以了，就把分支合进 `main`，然后在生产实例上正常升级：

```bash
cp ~/myaccountbook/data/app.db ~/backups/app-before-upgrade.db   # 先备份
cd ~/myaccountbook
docker compose pull
docker compose up -d
```

容器启动时会自动 baseline 老库再增量迁移，无需手工操作。

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

## 数据备份

数据只有一个 SQLite 文件，备份 = 复制：

```bash
# 手动备份
cp ~/myaccountbook/data/app.db ~/backups/app-$(date +%F).db

# 定时备份（crontab -e）
0 3 * * * cp ~/myaccountbook/data/app.db ~/backups/app-$(date +\%F).db && find ~/backups -mtime +30 -delete
```

App 内首页有 **导出备份** 入口，两种格式：

- **完整备份 JSON** —— 结构化全量数据，换服务器/迁移用这个
- **表格 CSV** —— Excel 直接打开，仅供查看

两者覆盖的表完全一致（工作 / 桃源 / 普通 / 旅游全部在内）。
JSON 备份**刻意不含密码哈希** —— 备份文件在你手里，不该带哈希。
所以它不能用来迁移用户账号；要迁账号请直接复制 `app.db` 文件。

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
