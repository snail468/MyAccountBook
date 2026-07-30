#!/bin/sh
set -e

PRISMA="node ./node_modules/prisma/build/index.js"
DATA_DIR="/data"

# 确保数据目录归属正确（首次挂载 volume 常常是 root:root）
mkdir -p "${DATA_DIR}" "${DATA_DIR}/uploads"
chown -R nextjs:nodejs "${DATA_DIR}"

# ---------------------------------------------------------------------------
# 数据库 schema 同步
#
# 历史包袱：v1 用的是 `prisma db push --accept-data-loss`，每次启动都按当前 schema
# 强行改表 —— 字段改名/删列会**静默丢数据**，且没有版本记录、无法回滚。
# 现在改用 prisma migrate，要区分三种库：
#
#   1. 全新部署（没有 app.db）
#        → migrate deploy 直接建表，并记录 0_init 已应用
#   2. 已迁移过的库（有 _prisma_migrations 记录）
#        → migrate deploy 只跑新增的迁移
#   3. db push 时代的老库（有表，但没有 _prisma_migrations）
#        → 必须先 baseline：把 0_init 标记为"已应用"但**不执行**它（表已经存在了），
#          之后的新迁移才会正常增量执行。直接 deploy 会报 P3005。
#
# 判据用的是 deploy 的**真实结果**，而不是数据目录里的标记文件。
# 早先的版本靠 /data/.prisma-baselined 来区分 2 和 3，代价惨痛：那个文件标记的是
# 「这个目录」而不是「这个库」。一旦 app.db 被换掉（典型场景：预览实例先用空库跑
# 起来生成了标记，事后又把生产库拷进来），标记就成了张过期的假证明 ——
# baseline 分支被跳过，deploy 报 P3005，配上 restart: unless-stopped 就是无限
# crashloop。现在改成先试 deploy，只在确认是 P3005 时才补 baseline 重试，
# 换库、换目录、手工拷贝都能自愈。
# ---------------------------------------------------------------------------

if [ "${SKIP_DB_MIGRATE}" = "true" ]; then
  echo "[entrypoint] SKIP_DB_MIGRATE=true，跳过 schema 同步"
else
  echo "[entrypoint] 应用数据库迁移..."
  # set -e 下用 if 包住，失败不会直接退出，先拿到输出判断错误类型
  if migrate_out=$(su-exec nextjs:nodejs ${PRISMA} migrate deploy 2>&1); then
    echo "${migrate_out}"
  else
    echo "${migrate_out}"
    # P3005 = 库里有表但没有迁移历史，即 db push 时代的老库
    if echo "${migrate_out}" | grep -q 'P3005'; then
      echo "[entrypoint] 检测到 db push 时代的老数据库，baseline 到 0_init（不改表结构）后重试..."
      su-exec nextjs:nodejs ${PRISMA} migrate resolve --applied 0_init
      # 这次失败就是真失败，让 set -e 把容器带下去，不要静默启动一个 schema 不对的服务
      su-exec nextjs:nodejs ${PRISMA} migrate deploy
    else
      echo "[entrypoint] 迁移失败，且不是可自愈的 P3005，退出。" >&2
      exit 1
    fi
  fi
fi

echo "[entrypoint] 启动服务 (port ${PORT:-3000})..."
exec su-exec nextjs:nodejs "$@"
