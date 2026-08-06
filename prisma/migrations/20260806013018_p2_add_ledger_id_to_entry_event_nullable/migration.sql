-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ledgerId" TEXT,
    "yearMonth" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "clientId" TEXT,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entry_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Entry" ("amountCents", "category", "clientId", "createdAt", "deletedAt", "direction", "id", "note", "occurredAt", "refundedAt", "userId", "yearMonth") SELECT "amountCents", "category", "clientId", "createdAt", "deletedAt", "direction", "id", "note", "occurredAt", "refundedAt", "userId", "yearMonth" FROM "Entry";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE INDEX "Entry_userId_yearMonth_idx" ON "Entry"("userId", "yearMonth");
CREATE INDEX "Entry_userId_deletedAt_idx" ON "Entry"("userId", "deletedAt");
CREATE UNIQUE INDEX "Entry_userId_clientId_key" ON "Entry"("userId", "clientId");
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ledgerId" TEXT,
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
    "deletedAt" DATETIME,
    "clientId" TEXT,
    CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("announcedAt", "announcedCents", "clientId", "content", "contentImages", "createdAt", "deadline", "deletedAt", "id", "note", "paidAt", "paidCents", "parentId", "participate", "predictedAt", "predictedCents", "publishedAt", "reward", "rewardMethod", "rewardMethods", "startAt", "status", "title", "topicTag", "updatedAt", "userId") SELECT "announcedAt", "announcedCents", "clientId", "content", "contentImages", "createdAt", "deadline", "deletedAt", "id", "note", "paidAt", "paidCents", "parentId", "participate", "predictedAt", "predictedCents", "publishedAt", "reward", "rewardMethod", "rewardMethods", "startAt", "status", "title", "topicTag", "updatedAt", "userId" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE INDEX "Event_userId_status_idx" ON "Event"("userId", "status");
CREATE INDEX "Event_parentId_idx" ON "Event"("parentId");
CREATE INDEX "Event_userId_deletedAt_idx" ON "Event"("userId", "deletedAt");
CREATE UNIQUE INDEX "Event_userId_clientId_key" ON "Event"("userId", "clientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
