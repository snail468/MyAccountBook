# syntax=docker/dockerfile:1.7
#
# 基础镜像用 node:22-alpine —— Node 20 已过维护期（2026-04 EOL），
# GitHub Actions 也在下线它。22 是当前 LTS，与 .github/workflows/ci.yml 保持一致。
#
# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# npm 缓存 + Prisma 引擎下载缓存都挂 BuildKit cache mount。
# postinstall 会跑 prisma generate，engines 从网络拉一份 ~40MB，缓存
# 命中后能省掉这部分带宽和时间。用 sharing=locked 避免并行 buildkit
# 任务撞车。
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    --mount=type=cache,target=/root/.cache/prisma,sharing=locked \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------- builder ----------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1
# 构建期使用一个占位 DB URL，避免 Prisma 初始化报错；实际数据库在运行时挂载
ENV DATABASE_URL="file:./build-placeholder.db"
# 同理给一个占位会话密钥。next build 会把 NODE_ENV 设成 production，
# 而 "Collecting page data" 阶段会 import 所有路由模块 ——
# lib/env.ts 在模块作用域校验密钥，缺了就会让构建失败。
# 代码里已用 NEXT_PHASE 识别构建期放行，这里再显式给一个是双重保险。
# 这个值**不会**进入最终镜像：runner 是独立的 FROM 阶段，ENV 不继承，
# 真密钥由 docker-compose 在运行时注入。
ENV SESSION_SECRET="build-time-placeholder-value-never-used-at-runtime"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma engines 缓存与 deps 阶段共用；这里的 generate 只是重新生成 client 类型
RUN --mount=type=cache,target=/root/.cache/prisma,sharing=locked \
    npx prisma generate
# .next/cache 是 Next 的 webpack + SWC 增量编译缓存 —— 挂 BuildKit cache mount
# 后，只改少量文件时增量编译能省 40-60%。缓存随 gha cache-to=mode=max 一起
# 持久化到 Actions cache，多次构建之间复用。
# amd64 / arm64 用不同 stage instance，各自命中自己那份缓存，互不干扰。
RUN --mount=type=cache,target=/app/.next/cache,sharing=locked \
    npm run build || (npx next build)

# ---------- runner ----------
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat tini su-exec \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL="file:/data/app.db" \
    UPLOAD_ROOT="/data/uploads"

# standalone 输出包含最小 node_modules 和 server.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Prisma CLI 用于运行 db push（entrypoint 里同步 schema）
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# 数据卷（挂载后 sqlite 落盘）
VOLUME ["/data"]

# 启动脚本：修正 volume 权限、同步 schema、再降权启动
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 以 root 启动，entrypoint 里修好 /data 权限后再 su-exec 到 nextjs
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
