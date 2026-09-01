-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "costPerUnit" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hourlyRate" DECIMAL(10,2);

