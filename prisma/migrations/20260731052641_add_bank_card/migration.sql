-- CreateTable
CREATE TABLE "BankCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "alias" TEXT,
    "cardType" TEXT NOT NULL,
    "holder" TEXT,
    "last4" TEXT NOT NULL,
    "numberEnc" TEXT NOT NULL,
    "noteEnc" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BankCard_userId_order_idx" ON "BankCard"("userId", "order");
