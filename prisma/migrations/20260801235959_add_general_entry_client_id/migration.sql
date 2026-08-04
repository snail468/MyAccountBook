-- AlterTable
ALTER TABLE "GeneralEntry" ADD COLUMN "clientId" TEXT;

-- CreateIndex
-- SQLite 的 UNIQUE 允许多个 NULL，历史条目不冲突；只对显式传了 clientId 的行去重
CREATE UNIQUE INDEX "GeneralEntry_ledgerId_clientId_key" ON "GeneralEntry"("ledgerId", "clientId");
