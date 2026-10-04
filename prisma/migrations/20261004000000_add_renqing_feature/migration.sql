-- CreateTable
CREATE TABLE "GiftPerson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "group" TEXT NOT NULL DEFAULT 'other',
    "phone" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "GiftPerson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GiftEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "eventDate" DATETIME NOT NULL,
    "banquetCostCents" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "GiftEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GiftRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "personNameSnapshot" TEXT NOT NULL,
    "eventId" TEXT,
    "direction" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "itemType" TEXT NOT NULL DEFAULT 'money',
    "giftItemDesc" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPendingReturn" BOOLEAN NOT NULL DEFAULT false,
    "returnRemindedAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "GiftRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GiftRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "GiftPerson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GiftRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "GiftEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GiftPerson_userId_deletedAt_idx" ON "GiftPerson"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "GiftPerson_userId_name_idx" ON "GiftPerson"("userId", "name");

-- CreateIndex
CREATE INDEX "GiftPerson_userId_group_idx" ON "GiftPerson"("userId", "group");

-- CreateIndex
CREATE INDEX "GiftEvent_userId_deletedAt_idx" ON "GiftEvent"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "GiftEvent_userId_eventDate_idx" ON "GiftEvent"("userId", "eventDate");

-- CreateIndex
CREATE INDEX "GiftRecord_userId_direction_idx" ON "GiftRecord"("userId", "direction");

-- CreateIndex
CREATE INDEX "GiftRecord_personId_deletedAt_idx" ON "GiftRecord"("personId", "deletedAt");

-- CreateIndex
CREATE INDEX "GiftRecord_eventId_deletedAt_idx" ON "GiftRecord"("eventId", "deletedAt");

-- CreateIndex
CREATE INDEX "GiftRecord_userId_occurredAt_idx" ON "GiftRecord"("userId", "occurredAt");
