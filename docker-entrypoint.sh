#!/bin/sh
set -e

PRISMA="node ./node_modules/prisma/build/index.js"
DATA_DIR="/data"
DB_FILE="${DATA_DIR}/app.db"
# 标记文件：表示这个数据目录已经纳入 prisma migrate 管理
BASELINE_MARK="${DATA_DIR}/.prisma-baselined"

# 确保数据目录归属正确（首次挂载 volume 常常是 root:root）
mkdir -p "${DATA_DIR}" "${DATA_DIR}/uploads"
chown -R nextjs:nodejs "${DATA_DIR}"

# ---------------------------------------------------------------------------
# 数据库 schema 同步
#
# 历史包袱：v1 用的是 `prisma db push --accept-data-loss`，每次启动都按当前 schema
# 强行改表 —— 字段改名/删列会**静默丢数据**，且没有版本记录、无法回滚。
# 现在改用 prisma migrate。需要区分三种情况：
#
#   1. 全新部署（没有 app.db）
#        → migrate deploy 直接建表，并记录 0_init 已应用
#   2. 老部署（app.db 由 db push 创建，没有 _prisma_migrations 记录）
#        → 先 baseline：把 0_init 标记为"已应用"但**不执行**它（表已经存在了），
#          之后的新迁移才会正常增量执行。误执行会因 "table already exists" 失败。
#   3. 已迁移过的部署（有标记文件）
#        → 直接 deploy，只跑新增的迁移
#
# 用 ${BASELINE_MARK} 标记文件区分 1/2 和 3，避免在容器里做 SQLite 内省。
# ---------------------------------------------------------------------------

needs_baseline() {
  # 已经标记过 → 不需要
  [ -f "${BASELINE_MARK}" ] && return 1
  # 没有 db 文件 → 全新部署，不需要 baseline
  [ ! -f "${DB_FILE}" ] && return 1
  # 有 db 文件但太小，可能是上次失败留下的空壳 → 当作全新部署处理
  size=$(wc -c < "${DB_FILE}" 2>/dev/null || echo 0)
  [ "${size}" -lt 8192 ] && return 1
  return 0
}

if [ "${SKIP_DB_MIGRATE}" = "true" ]; then
  echo "[entrypoint] SKIP_DB_MIGRATE=true，跳过 schema 同步"
else
  if needs_baseline; then
    echo "[entrypoint] 检测到 db push 时代的老数据库，先 baseline 到 0_init（不改表结构）..."
    su-exec nextjs:nodejs ${PRISMA} migrate resolve --applied 0_init
  fi

  echo "[entrypoint] 应用数据库迁移..."
  su-exec nextjs:nodejs ${PRISMA} migrate deploy

  su-exec nextjs:nodejs touch "${BASELINE_MARK}"
fi

echo "[entrypoint] 启动服务 (port ${PORT:-3000})..."
exec su-exec nextjs:nodejs "$@"
