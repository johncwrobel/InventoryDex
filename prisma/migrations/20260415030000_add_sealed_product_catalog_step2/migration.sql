-- Migration B: Finalize SealedInventoryItem — make sealedProductId required,
-- drop legacy inline product fields now that all rows reference SealedProduct.

-- Make sealedProductId required (all rows already have it set).
ALTER TABLE "SealedInventoryItem" ALTER COLUMN "sealedProductId" SET NOT NULL;

-- Drop legacy inline fields (data lives in SealedProduct now).
ALTER TABLE "SealedInventoryItem" DROP COLUMN IF EXISTS "productType";
ALTER TABLE "SealedInventoryItem" DROP COLUMN IF EXISTS "name";
ALTER TABLE "SealedInventoryItem" DROP COLUMN IF EXISTS "setName";
ALTER TABLE "SealedInventoryItem" DROP COLUMN IF EXISTS "imageUrl";
