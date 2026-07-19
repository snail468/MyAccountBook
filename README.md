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
   DISABLE_REGISTRATION=false
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

## 关闭注册（只想给自己用）

第一个账号注册后，编辑服务器上的 `.env`：

```bash
DISABLE_REGISTRATION=true
```

然后 `docker compose up -d`（会自动重启并生效）。之后 `/register` 会返回 403。

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
