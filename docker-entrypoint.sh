#!/bin/sh
set -e

# 确保数据目录归属正确（首次挂载 volume 常常是 root:root）
mkdir -p /data
chown -R nextjs:nodejs /data

echo "[entrypoint] 同步数据库 schema..."
su-exec nextjs:nodejs node ./node_modules/prisma/build/index.js db push --skip-generate

echo "[entrypoint] 启动服务 (port ${PORT:-3000})..."
exec su-exec nextjs:nodejs "$@"
