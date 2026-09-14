-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "rateNote" TEXT,
    "accountInfo" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Broker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardStaff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workNo" TEXT NOT NULL,
    "phone" TEXT,
    "branch" TEXT,
    "commissionNote" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "CardStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoanOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "loanType" TEXT NOT NULL DEFAULT 'mortgage',
    "stage" TEXT NOT NULL DEFAULT 'intention',
    "status" TEXT NOT NULL DEFAULT 'intention',
    "borrowerName" TEXT NOT NULL,
    "phone" TEXT,
    "idCard" TEXT,
    "brokerId" TEXT,
    "brokerNameSnapshot" TEXT,
    "cardStaffId" TEXT,
    "cardStaffNameSnapshot" TEXT,
    "cardStaffWorkNoSnapshot" TEXT,
    "propertyAddress" TEXT,
    "propertyArea" REAL,
    "propertyPriceCents" INTEGER,
    "downPaymentCents" INTEGER,
    "demandAmountCents" INTEGER,
    "demandTermMonths" INTEGER,
    "bankName" TEXT,
    "approvedAmountCents" INTEGER,
    "approvedRate" REAL,
    "repaymentMethod" TEXT,
    "actualAmountCents" INTEGER,
    "loanDate" DATETIME,
    "firstRepayDate" DATETIME,
    "monthlyPaymentCents" INTEGER,
    "dueDate" DATETIME,
    "serviceFeeCents" INTEGER,
    "brokerCommissionCents" INTEGER,
    "cardCommissionCents" INTEGER,
    "netIncomeCents" INTEGER,
    "initialDescription" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LoanOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoanOrder_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LoanOrder_cardStaffId_fkey" FOREIGN KEY ("cardStaffId") REFERENCES "CardStaff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoanOrderLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoanOrderLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LoanOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoanOrderAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoanOrderAttachment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LoanOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "clientId" TEXT,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entry_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Entry" ("amountCents", "category", "clientId", "createdAt", "deletedAt", "direction", "id", "ledgerId", "note", "occurredAt", "refundedAt", "updatedAt", "userId", "yearMonth") SELECT "amountCents", "category", "clientId", "createdAt", "deletedAt", "direction", "id", "ledgerId", "note", "occurredAt", "refundedAt", "updatedAt", "userId", "yearMonth" FROM "Entry";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE INDEX "Entry_ledgerId_yearMonth_idx" ON "Entry"("ledgerId", "yearMonth");
CREATE INDEX "Entry_ledgerId_deletedAt_idx" ON "Entry"("ledgerId", "deletedAt");
CREATE UNIQUE INDEX "Entry_ledgerId_clientId_key" ON "Entry"("ledgerId", "clientId");
CREATE TABLE "new_GeneralEntry" (
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
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "clientId" TEXT,
    CONSTRAINT "GeneralEntry_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GeneralEntry" ("amountCents", "category", "clientId", "createdAt", "deletedAt", "direction", "id", "imageUrls", "ledgerId", "note", "occurredAt", "tags", "updatedAt") SELECT "amountCents", "category", "clientId", "createdAt", "deletedAt", "direction", "id", "imageUrls", "ledgerId", "note", "occurredAt", "tags", "updatedAt" FROM "GeneralEntry";
DROP TABLE "GeneralEntry";
ALTER TABLE "new_GeneralEntry" RENAME TO "GeneralEntry";
CREATE INDEX "GeneralEntry_ledgerId_occurredAt_idx" ON "GeneralEntry"("ledgerId", "occurredAt");
CREATE INDEX "GeneralEntry_ledgerId_deletedAt_idx" ON "GeneralEntry"("ledgerId", "deletedAt");
CREATE UNIQUE INDEX "GeneralEntry_ledgerId_clientId_key" ON "GeneralEntry"("ledgerId", "clientId");
CREATE TABLE "new_TripExpense" (
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
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "clientId" TEXT,
    CONSTRAINT "TripExpense_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripExpense_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "TripMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TripExpense" ("amountBaseCents", "amountForeignCents", "category", "clientId", "createdAt", "currency", "deletedAt", "id", "imageUrls", "ledgerId", "note", "occurredAt", "payerId", "phase", "rate", "title", "updatedAt") SELECT "amountBaseCents", "amountForeignCents", "category", "clientId", "createdAt", "currency", "deletedAt", "id", "imageUrls", "ledgerId", "note", "occurredAt", "payerId", "phase", "rate", "title", "updatedAt" FROM "TripExpense";
DROP TABLE "TripExpense";
ALTER TABLE "new_TripExpense" RENAME TO "TripExpense";
CREATE INDEX "TripExpense_ledgerId_phase_idx" ON "TripExpense"("ledgerId", "phase");
CREATE INDEX "TripExpense_ledgerId_deletedAt_idx" ON "TripExpense"("ledgerId", "deletedAt");
CREATE UNIQUE INDEX "TripExpense_ledgerId_clientId_key" ON "TripExpense"("ledgerId", "clientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Broker_userId_deletedAt_idx" ON "Broker"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Broker_userId_name_idx" ON "Broker"("userId", "name");

-- CreateIndex
CREATE INDEX "CardStaff_userId_deletedAt_idx" ON "CardStaff"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "CardStaff_userId_workNo_idx" ON "CardStaff"("userId", "workNo");

-- CreateIndex
CREATE INDEX "LoanOrder_userId_stage_idx" ON "LoanOrder"("userId", "stage");

-- CreateIndex
CREATE INDEX "LoanOrder_userId_loanType_idx" ON "LoanOrder"("userId", "loanType");

-- CreateIndex
CREATE INDEX "LoanOrder_userId_deletedAt_idx" ON "LoanOrder"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "LoanOrder_orderNo_idx" ON "LoanOrder"("orderNo");

-- CreateIndex
CREATE INDEX "LoanOrderLog_orderId_occurredAt_idx" ON "LoanOrderLog"("orderId", "occurredAt");

-- CreateIndex
CREATE INDEX "LoanOrderAttachment_orderId_idx" ON "LoanOrderAttachment"("orderId");

