-- B7 数据回填：给每个既有 Ledger 补一条 owner 成员行。
--
-- 幂等：INSERT OR IGNORE + UNIQUE(ledgerId,userId) 保证跑两遍也不出错。
-- id 用 hex(randomblob(16)) —— cuid 只能在应用层生成，这里图省事用 SQLite
-- 原生的伪随机 hex。够用了，未来 owner 也不会以主键为 UI 显示。
INSERT OR IGNORE INTO "LedgerMember" ("id", "ledgerId", "userId", "role", "createdAt")
SELECT
  lower(hex(randomblob(16))),
  "id",
  "userId",
  'owner',
  CURRENT_TIMESTAMP
FROM "Ledger";
