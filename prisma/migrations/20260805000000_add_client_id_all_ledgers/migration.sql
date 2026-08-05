-- 为工作/桃源/旅游账本加离线记账幂等键。
-- 语义与 GeneralEntry.clientId 一致（见 20260801235959_add_general_entry_client_id）：
-- SQLite 的 UNIQUE 允许多个 NULL，历史行 clientId=null 天然不冲突，
-- 只对显式带 UUID 的行去重。

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN "clientId" TEXT;
CREATE UNIQUE INDEX "Entry_userId_clientId_key" ON "Entry"("userId", "clientId");

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "clientId" TEXT;
CREATE UNIQUE INDEX "Event_userId_clientId_key" ON "Event"("userId", "clientId");

-- AlterTable
ALTER TABLE "TripExpense" ADD COLUMN "clientId" TEXT;
CREATE UNIQUE INDEX "TripExpense_ledgerId_clientId_key" ON "TripExpense"("ledgerId", "clientId");
