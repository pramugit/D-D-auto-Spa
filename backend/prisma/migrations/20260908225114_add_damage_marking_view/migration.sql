-- CreateEnum
CREATE TYPE "VehicleView" AS ENUM ('FRONT', 'REAR', 'LEFT', 'RIGHT');

-- DropForeignKey
ALTER TABLE "inventory_usages" DROP CONSTRAINT "inventory_usages_itemId_fkey";

-- AlterTable
ALTER TABLE "damage_markings" ADD COLUMN     "view" "VehicleView" NOT NULL DEFAULT 'FRONT';

-- AddForeignKey
ALTER TABLE "inventory_usages" ADD CONSTRAINT "inventory_usages_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
