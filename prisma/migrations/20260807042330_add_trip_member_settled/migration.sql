-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TripMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ledgerId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripMember_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TripMember" ("createdAt", "displayName", "id", "ledgerId", "userId") SELECT "createdAt", "displayName", "id", "ledgerId", "userId" FROM "TripMember";
DROP TABLE "TripMember";
ALTER TABLE "new_TripMember" RENAME TO "TripMember";
CREATE INDEX "TripMember_ledgerId_idx" ON "TripMember"("ledgerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
