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

# 3. 初始化数据库（会在 data/app.db 创建 SQLite 文件）
mkdir -p data
npx prisma db push

# 4. 启动
npm run dev
# 打开 http://localhost:3000
```

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
   git remote add origin https://github.com/snail46/MyAccountBook.git
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

除了 Docker 自建，本项目也支持部署到 **Cloudflare Pages** —— 全球边缘节点秒开、免维护、零成本起步（免费额度即可跑一个个人账本）。数据库切换到 **Turso**（远端 SQLite）、图片走 **R2**（S3 兼容对象存储），Prisma schema 和业务代码完全复用。

### A. 一次性准备（约 10 分钟）

1. **注册 Cloudflare 账号** → 创建 Pages / Workers（免费套餐即可）
2. **注册 Turso**（<https://turso.tech>）
   ```bash
   # 装 CLI（macOS/Linux/WSL）
   curl -sSfL https://get.tur.so/install.sh | bash
   turso auth login
   # 建库
   turso db create myaccountbook
   # 拿连接串 & token
   turso db show myaccountbook --url          # → libsql://xxx.turso.io
   turso db tokens create myaccountbook       # → eyJhbGc...
   ```
3. **建 R2 存储桶**
   - Cloudflare 面板 → R2 → Create bucket，命名 `myaccountbook-uploads`
   - R2 → Manage R2 API Tokens → Create API token（权限 Object Read & Write），记下 `Account ID` / `Access Key` / `Secret Key`
4. **初始化数据库表**（一次性）
   ```bash
   # 在本项目根目录：
   npm install
   # 用 Turso URL 直接 push schema
   DATABASE_URL="libsql://xxx.turso.io?authToken=eyJhbGc..." \
     npx prisma db push
   ```

### B. 项目配置

1. **安装 CF 部署工具链**（这几个依赖 Docker 部署用不到，所以刻意没塞进 `package.json` 主 dep 里避免拖累镜像 & lock 冲突）

   ```bash
   npm install                     # 常规依赖
   npm run cf:setup                # 加装 wrangler + @opennextjs/cloudflare + @libsql/client + @prisma/adapter-libsql
   npx wrangler login
   ```

2. **写入 secrets**（不会明文出现在 `wrangler.toml` 里）
   ```bash
   npx wrangler secret put SESSION_SECRET        # 粘贴 openssl rand -base64 32 的输出
   npx wrangler secret put TURSO_DATABASE_URL    # libsql://xxx.turso.io
   npx wrangler secret put TURSO_AUTH_TOKEN
   npx wrangler secret put R2_ACCOUNT_ID
   npx wrangler secret put R2_ACCESS_KEY
   npx wrangler secret put R2_SECRET_KEY
   npx wrangler secret put R2_BUCKET             # myaccountbook-uploads
   ```

### C. 构建与部署

```bash
# 本地预览
npm run preview:cf

# 正式发布
npm run deploy:cf
```

首次 deploy 会创建 `myaccountbook` Worker/Pages 项目，输出访问 URL（形如 `https://myaccountbook.你的subdomain.workers.dev`）。绑定自定义域名后即可作为 PWA 装到手机主屏。

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
