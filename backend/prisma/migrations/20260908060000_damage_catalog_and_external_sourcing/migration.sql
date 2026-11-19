-- pgcrypto for gen_random_uuid(), used below to mint ids for rows created
-- by this migration's data-conversion step.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- New enums ----------

CREATE TYPE "DamageApprovalStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'APPROVED', 'DECLINED');
CREATE TYPE "InventorySourceType" AS ENUM ('INTERNAL_STOCK', 'EXTERNAL_PURCHASE');

-- ---------- JobNotificationType: add DAMAGE_MARKING_DECIDED ----------

ALTER TYPE "JobNotificationType" ADD VALUE 'DAMAGE_MARKING_DECIDED';

-- ---------- DamageType catalog ----------

CREATE TABLE "damage_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultPrice" DECIMAL(10,2) NOT NULL,
    "category" "ServiceCategoryName" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "damage_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "damage_types_name_key" ON "damage_types"("name");

-- ---------- DamageMarking (normalized child table) ----------

CREATE TABLE "damage_markings" (
    "id" TEXT NOT NULL,
    "damageInspectionId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "damageTypeId" TEXT,
    "note" TEXT,
    "suggestedPrice" DECIMAL(10,2),
    "isAdditionalRepairOffer" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" "DamageApprovalStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "damage_markings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "damage_markings_damageInspectionId_idx" ON "damage_markings"("damageInspectionId");

ALTER TABLE "damage_markings" ADD CONSTRAINT "damage_markings_damageInspectionId_fkey" FOREIGN KEY ("damageInspectionId") REFERENCES "damage_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "damage_markings" ADD CONSTRAINT "damage_markings_damageTypeId_fkey" FOREIGN KEY ("damageTypeId") REFERENCES "damage_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------- Data migration: existing diagramMarkings JSON -> rows ----------
-- Old element shape (some older rows predate even these keys):
--   { id?, x, y, note, price?, customerApproved? }
-- Mapping: price > 0 -> billable "additional repair offer" (suggestedPrice
-- set, isAdditionalRepairOffer true); customerApproved true/false/null maps
-- to APPROVED/DECLINED/PENDING; a marking with no price at all is plain
-- documentation (NOT_APPLICABLE, unbillable) — the liability-protection
-- use case, untouched by this migration.
INSERT INTO "damage_markings" ("id", "damageInspectionId", "x", "y", "note", "suggestedPrice", "isAdditionalRepairOffer", "approvalStatus", "createdAt")
SELECT
    gen_random_uuid()::text,
    di."id",
    (elem->>'x')::double precision,
    (elem->>'y')::double precision,
    elem->>'note',
    NULLIF((elem->>'price')::decimal, 0),
    (COALESCE((elem->>'price')::decimal, 0) > 0),
    CASE
        WHEN COALESCE((elem->>'price')::decimal, 0) = 0 THEN 'NOT_APPLICABLE'::"DamageApprovalStatus"
        WHEN elem->>'customerApproved' = 'true' THEN 'APPROVED'::"DamageApprovalStatus"
        WHEN elem->>'customerApproved' = 'false' THEN 'DECLINED'::"DamageApprovalStatus"
        ELSE 'PENDING'::"DamageApprovalStatus"
    END,
    di."createdAt"
FROM "damage_inspections" di,
    LATERAL jsonb_array_elements(COALESCE(di."diagramMarkings", '[]'::jsonb)) AS elem
WHERE di."diagramMarkings" IS NOT NULL AND jsonb_typeof(di."diagramMarkings") = 'array';

ALTER TABLE "damage_inspections" DROP COLUMN "diagramMarkings";

-- ---------- InventoryUsage: isExternal/externalUnitCost -> sourceType/externalCost ----------

ALTER TABLE "inventory_usages" ADD COLUMN "sourceType" "InventorySourceType" NOT NULL DEFAULT 'INTERNAL_STOCK';
UPDATE "inventory_usages" SET "sourceType" = 'EXTERNAL_PURCHASE' WHERE "isExternal" = true;
ALTER TABLE "inventory_usages" DROP COLUMN "isExternal";

ALTER TABLE "inventory_usages" RENAME COLUMN "externalUnitCost" TO "externalCost";
ALTER TABLE "inventory_usages" ADD COLUMN "externalVendorNote" TEXT;
