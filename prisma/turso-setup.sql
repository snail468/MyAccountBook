-- ============================================================
-- MyAccountBook · Turso 一次性建库脚本（自动生成，请勿手改）
--
-- 由 scripts/gen-turso-sql.mjs 从 prisma/migrations 生成。
-- 迁移目录有变动后请重新跑：npm run turso:gen-sql
--
-- 用法：把本文件全部内容复制，粘贴到 Turso 面板的 SQL 控制台执行。
--       只需在**全新的空库**上执行一次。
--
-- 包含的迁移（2 个）：
--   0_init
--   20260730011420_add_user_security_fields
-- ============================================================

-- Prisma 的迁移记录表。有了它，以后用 npm run turso:status 或
-- prisma migrate status 检查时才不会认为这些迁移"尚未应用"。
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
);


-- ------------------------------------------------------------
-- 迁移 1/2：0_init
-- ------------------------------------------------------------
-- 初始迁移（baseline）
--
-- 这份 SQL 描述的是本项目在切换到 prisma migrate 之前、由 `prisma db push` 生成的表结构。
-- 对**已有部署**：不要执行它，用 `prisma migrate resolve --applied 0_init` 标记为已应用即可
--   （docker-entrypoint.sh 会自动检测并处理）。
-- 对**全新部署**：`prisma migrate deploy` 会执行它建表。

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startAt" DATETIME,
    "content" TEXT,
    "rewardMethod" TEXT,
    "rewardMethods" TEXT,
    "reward" TEXT,
    "topicTag" TEXT,
    "contentImages" TEXT,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "participate" BOOLEAN NOT NULL DEFAULT true,
    "deadline" DATETIME,
    "predictedCents" INTEGER,
    "announcedCents" INTEGER,
    "paidCents" INTEGER,
    "predictedAt" DATETIME,
    "announcedAt" DATETIME,
    "paidAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'published',
    "note" TEXT,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventAmount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "cents" INTEGER NOT NULL,
    "note" TEXT,
    "rewardMethod" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventAmount_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "budgetCents" INTEGER,
    "customCategories" TEXT,
    "baseCurrency" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneralEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ledgerId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "tags" TEXT,
    "note" TEXT,
    "imageUrls" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneralEntry_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ledgerId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripMember_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ledgerId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountForeignCents" INTEGER NOT NULL,
    "rate" REAL NOT NULL,
    "amountBaseCents" INTEGER NOT NULL,
    "note" TEXT,
    "imageUrls" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripExpense_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripExpense_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "TripMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripSplit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expenseId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "shareCents" INTEGER NOT NULL,
    CONSTRAINT "TripSplit_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "TripExpense" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripSplit_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TripMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CurrencyRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Entry_userId_yearMonth_idx" ON "Entry"("userId", "yearMonth");

-- CreateIndex
CREATE INDEX "Event_userId_status_idx" ON "Event"("userId", "status");

-- CreateIndex
CREATE INDEX "Event_parentId_idx" ON "Event"("parentId");

-- CreateIndex
CREATE INDEX "EventAmount_eventId_stage_idx" ON "EventAmount"("eventId", "stage");

-- CreateIndex
CREATE INDEX "Ledger_userId_order_idx" ON "Ledger"("userId", "order");

-- CreateIndex
CREATE INDEX "GeneralEntry_ledgerId_occurredAt_idx" ON "GeneralEntry"("ledgerId", "occurredAt");

-- CreateIndex
CREATE INDEX "TripMember_ledgerId_idx" ON "TripMember"("ledgerId");

-- CreateIndex
CREATE INDEX "TripExpense_ledgerId_phase_idx" ON "TripExpense"("ledgerId", "phase");

-- CreateIndex
CREATE INDEX "TripSplit_expenseId_idx" ON "TripSplit"("expenseId");

-- CreateIndex
CREATE INDEX "TripSplit_memberId_idx" ON "TripSplit"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyRate_base_quote_key" ON "CurrencyRate"("base", "quote");

-- 登记这个迁移已应用
INSERT INTO "_prisma_migrations"
  ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
VALUES
  ('0a813218-de7c-c90f-0c13-cf00b860223d', 'bdde06ab9a5f846daeba76efae8480dd6f2895e4931f4d34ccdb5ab5ec94e471', '0_init', current_timestamp, current_timestamp, 1);


-- ------------------------------------------------------------
-- 迁移 2/2：20260730011420_add_user_security_fields
-- ------------------------------------------------------------
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME
);
INSERT INTO "new_User" ("createdAt", "id", "passwordHash", "role", "username") SELECT "createdAt", "id", "passwordHash", "role", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- 登记这个迁移已应用
INSERT INTO "_prisma_migrations"
  ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
VALUES
  ('d164a4ca-898b-d948-800b-dfa9caac0717', '384dccc44935fe09d9b3d07d854dcadcb3a7e6b9cd18658e3efabbc62bdb60ea', '20260730011420_add_user_security_fields', current_timestamp, current_timestamp, 1);


-- ============================================================
-- 执行完毕。可以用下面这句确认表都建好了：
--   SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
-- 应该能看到 User / Entry / Event / EventAmount / Ledger /
-- GeneralEntry / TripMember / TripExpense / TripSplit / CurrencyRate
-- 以及 _prisma_migrations。
-- ============================================================
