-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CardStaff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workNo" TEXT,
    "phone" TEXT,
    "branch" TEXT,
    "commissionNote" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "CardStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CardStaff" ("branch", "commissionNote", "createdAt", "deletedAt", "id", "name", "note", "phone", "updatedAt", "userId", "workNo") SELECT "branch", "commissionNote", "createdAt", "deletedAt", "id", "name", "note", "phone", "updatedAt", "userId", "workNo" FROM "CardStaff";
DROP TABLE "CardStaff";
ALTER TABLE "new_CardStaff" RENAME TO "CardStaff";
CREATE INDEX "CardStaff_userId_deletedAt_idx" ON "CardStaff"("userId", "deletedAt");
CREATE INDEX "CardStaff_userId_workNo_idx" ON "CardStaff"("userId", "workNo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

