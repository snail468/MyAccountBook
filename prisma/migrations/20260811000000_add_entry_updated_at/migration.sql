-- 增量同步水线：给普通账本/工作/旅游条目补 updatedAt（变更时间戳）。
-- 桃源活动(Event) 已有 updatedAt，无需处理。
-- 客户端同步时传 ?since=<updatedAt>，服务端仅返回 updatedAt>since 或
-- deletedAt>since 的变更行（含软删），实现「只拉变更」而非全量拉取。

ALTER TABLE "GeneralEntry" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Entry" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "TripExpense" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
