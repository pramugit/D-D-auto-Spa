-- AlterTable
ALTER TABLE "users" ADD COLUMN     "inventoryPinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inventoryPinHash" TEXT;
