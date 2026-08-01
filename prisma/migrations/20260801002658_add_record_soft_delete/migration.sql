-- AlterTable
ALTER TABLE "Entry" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "EventAmount" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "GeneralEntry" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "TripExpense" ADD COLUMN "deletedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Entry_userId_deletedAt_idx" ON "Entry"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Event_userId_deletedAt_idx" ON "Event"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "EventAmount_eventId_deletedAt_idx" ON "EventAmount"("eventId", "deletedAt");

-- CreateIndex
CREATE INDEX "GeneralEntry_ledgerId_deletedAt_idx" ON "GeneralEntry"("ledgerId", "deletedAt");

-- CreateIndex
CREATE INDEX "TripExpense_ledgerId_deletedAt_idx" ON "TripExpense"("ledgerId", "deletedAt");
