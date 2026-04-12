-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "grade" TEXT,
ADD COLUMN     "gradingCompany" TEXT,
ADD COLUMN     "isGraded" BOOLEAN NOT NULL DEFAULT false;
