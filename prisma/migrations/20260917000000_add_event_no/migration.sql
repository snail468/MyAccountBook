-- 桃源账本活动顺序编号：
-- 1. 添加 eventNo 列与对应索引
-- 2. 使用窗口函数按每个 ledgerId 内的 (createdAt ASC, startAt ASC, id ASC) 顺序依次回填 1, 2, 3...

ALTER TABLE "Event" ADD COLUMN "eventNo" INTEGER;

CREATE INDEX "Event_ledgerId_eventNo_idx" ON "Event"("ledgerId", "eventNo");

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "ledgerId"
    ORDER BY "createdAt" ASC, "startAt" ASC, "id" ASC
  ) AS rn
  FROM "Event"
)
UPDATE "Event"
SET "eventNo" = (SELECT rn FROM numbered WHERE numbered."id" = "Event"."id")
WHERE "eventNo" IS NULL;
