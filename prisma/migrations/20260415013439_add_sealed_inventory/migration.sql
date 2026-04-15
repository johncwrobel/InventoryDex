-- CreateEnum
CREATE TYPE "SealedProductType" AS ENUM ('BOOSTER_PACK', 'BOOSTER_BUNDLE', 'BOOSTER_BOX', 'ELITE_TRAINER_BOX', 'SUPER_PREMIUM_COLLECTION', 'SPECIAL_COLLECTION', 'THEME_DECK', 'TIN', 'OTHER');

-- CreateTable
CREATE TABLE "SealedInventoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productType" "SealedProductType" NOT NULL,
    "name" TEXT NOT NULL,
    "setName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isSealed" BOOLEAN NOT NULL DEFAULT true,
    "purchasePrice" DECIMAL(10,2) NOT NULL,
    "purchasedAt" TIMESTAMP(3),
    "listPrice" DECIMAL(10,2),
    "notes" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SealedInventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SealedInventoryItem_userId_idx" ON "SealedInventoryItem"("userId");

-- AddForeignKey
ALTER TABLE "SealedInventoryItem" ADD CONSTRAINT "SealedInventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
