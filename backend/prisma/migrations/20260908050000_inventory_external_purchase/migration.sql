-- Allow an inventory usage row to represent a part bought specifically
-- for a job (not tied to a stocked InventoryItem) when the shop doesn't
-- have it on hand — see InventoryUsage's isExternal/externalName/
-- externalUnitCost fields.
ALTER TABLE "inventory_usages" ALTER COLUMN "itemId" DROP NOT NULL;
ALTER TABLE "inventory_usages" ADD COLUMN "isExternal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "inventory_usages" ADD COLUMN "externalName" TEXT;
ALTER TABLE "inventory_usages" ADD COLUMN "externalUnitCost" DECIMAL(10,2);
