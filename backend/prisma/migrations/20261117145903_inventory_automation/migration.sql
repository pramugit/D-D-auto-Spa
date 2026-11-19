-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIVED', 'JOB_USAGE', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "category" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reorderQuantity" DECIMAL(10,2),
ADD COLUMN     "supplierName" TEXT,
ADD COLUMN     "supplierPhone" TEXT;

-- AlterTable
ALTER TABLE "job_cards" ADD COLUMN     "consumablesDeductedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "unitCost" DECIMAL(10,2),
    "note" TEXT,
    "jobCardId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_consumables" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "service_consumables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_itemId_createdAt_idx" ON "stock_movements"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_createdAt_idx" ON "stock_movements"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "service_consumables_serviceId_itemId_key" ON "service_consumables"("serviceId", "itemId");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "job_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_consumables" ADD CONSTRAINT "service_consumables_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_consumables" ADD CONSTRAINT "service_consumables_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: give every existing stocked item an opening-balance movement so
-- its history starts from the level it had before movements were tracked.
INSERT INTO "stock_movements" ("id", "itemId", "type", "quantity", "balanceAfter", "note")
SELECT gen_random_uuid()::text, "id", 'RECEIVED', "quantityInStock", "quantityInStock", 'Opening balance'
FROM "inventory_items"
WHERE "quantityInStock" <> 0;
