-- B7 Phase 2 数据回填：把 Entry.ledgerId 与 Event.ledgerId 填上。
--
-- 步骤：
--   1. 为每个 (userId, kind) 有孤儿 Entry/Event 但没有对应 Ledger 的用户，
--      补建一条 Ledger（幂等，用 NOT EXISTS 兜底）
--   2. 为新建的 Ledger 加 LedgerMember(role='owner')（也幂等）
--   3. UPDATE Entry.ledgerId = 该 user 的 work Ledger.id（deletedAt IS NULL、
--      非归档 优先；实在没有就取任意一条 work Ledger 兜底）
--   4. UPDATE Event.ledgerId = 同上，taoyuan
--
-- 迁移完之后立刻是下一个 migration 把两列改成 NOT NULL —— 所以本迁移必须让所有
-- Entry/Event 都有 ledgerId，任何一条 NULL 都会让下一步失败。

-- Step 1a: 为 Entry 找不到 work Ledger 的用户补建
INSERT INTO "Ledger" ("id", "userId", "kind", "name", "icon", "order", "archived", "createdAt", "updatedAt")
SELECT
  lower(hex(randomblob(16))),
  u."id",
  'work',
  '工作账本',
  '💼',
  COALESCE((SELECT MAX("order") + 1 FROM "Ledger" WHERE "userId" = u."id"), 0),
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "Entry" e WHERE e."userId" = u."id")
  AND NOT EXISTS (
    SELECT 1 FROM "Ledger" l
    WHERE l."userId" = u."id" AND l."kind" = 'work'
  );

-- Step 1b: 为 Event 找不到 taoyuan Ledger 的用户补建
INSERT INTO "Ledger" ("id", "userId", "kind", "name", "icon", "order", "archived", "createdAt", "updatedAt")
SELECT
  lower(hex(randomblob(16))),
  u."id",
  'taoyuan',
  '桃源账本',
  '🌸',
  COALESCE((SELECT MAX("order") + 1 FROM "Ledger" WHERE "userId" = u."id"), 0),
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "Event" ev WHERE ev."userId" = u."id")
  AND NOT EXISTS (
    SELECT 1 FROM "Ledger" l
    WHERE l."userId" = u."id" AND l."kind" = 'taoyuan'
  );

-- Step 2: 新建的 Ledger 补 owner LedgerMember（幂等）
INSERT OR IGNORE INTO "LedgerMember" ("id", "ledgerId", "userId", "role", "createdAt")
SELECT
  lower(hex(randomblob(16))),
  l."id",
  l."userId",
  'owner',
  CURRENT_TIMESTAMP
FROM "Ledger" l
WHERE l."kind" IN ('work', 'taoyuan');

-- Step 3: 回填 Entry.ledgerId。
-- 优先选 archived=0、deletedAt IS NULL 的活跃账本；同一用户理论上只有一条 work，
-- 但为了不假设唯一性，用 MIN(id) 稳定选一条。
UPDATE "Entry"
SET "ledgerId" = (
  SELECT l."id"
  FROM "Ledger" l
  WHERE l."userId" = "Entry"."userId"
    AND l."kind" = 'work'
  ORDER BY (l."archived") ASC, (l."deletedAt" IS NULL) DESC, l."createdAt" ASC
  LIMIT 1
)
WHERE "ledgerId" IS NULL;

-- Step 4: 回填 Event.ledgerId
UPDATE "Event"
SET "ledgerId" = (
  SELECT l."id"
  FROM "Ledger" l
  WHERE l."userId" = "Event"."userId"
    AND l."kind" = 'taoyuan'
  ORDER BY (l."archived") ASC, (l."deletedAt" IS NULL) DESC, l."createdAt" ASC
  LIMIT 1
)
WHERE "ledgerId" IS NULL;
