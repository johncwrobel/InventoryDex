-- AlterTable
ALTER TABLE "SealedInventoryItem" ADD COLUMN     "sealedProductId" TEXT,
ALTER COLUMN "productType" DROP NOT NULL,
ALTER COLUMN "name" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SealedProduct" (
    "id" TEXT NOT NULL,
    "setId" TEXT,
    "setName" TEXT,
    "productType" "SealedProductType" NOT NULL,
    "name" TEXT NOT NULL,
    "tcgplayerUrl" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SealedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SealedPricePoint" (
    "id" TEXT NOT NULL,
    "sealedProductId" TEXT NOT NULL,
    "market" DECIMAL(10,2),
    "low" DECIMAL(10,2),
    "high" DECIMAL(10,2),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SealedPricePoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SealedProduct_name_idx" ON "SealedProduct"("name");

-- CreateIndex
CREATE INDEX "SealedProduct_setId_productType_idx" ON "SealedProduct"("setId", "productType");

-- CreateIndex
CREATE INDEX "SealedPricePoint_sealedProductId_capturedAt_idx" ON "SealedPricePoint"("sealedProductId", "capturedAt");

-- AddForeignKey
ALTER TABLE "SealedPricePoint" ADD CONSTRAINT "SealedPricePoint_sealedProductId_fkey" FOREIGN KEY ("sealedProductId") REFERENCES "SealedProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedInventoryItem" ADD CONSTRAINT "SealedInventoryItem_sealedProductId_fkey" FOREIGN KEY ("sealedProductId") REFERENCES "SealedProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
