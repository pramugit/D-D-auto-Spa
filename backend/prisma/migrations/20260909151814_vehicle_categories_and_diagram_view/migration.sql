-- Phase A: expand VehicleType to 9 categories (SEDAN, HATCHBACK, SUV, VAN,
-- JEEP, CAB, LORRY, SEVEN_SEATER, BUS) and rename VehicleView -> DiagramView
-- (LEFT/RIGHT -> LEFT_SIDE/RIGHT_SIDE) for the new 4-view diagram set.
--
-- Data mapping (documented, not silent):
--   vehicles.vehicleType / service_pricing.vehicleType:
--     PICKUP -> CAB    (closest real-world match)
--     OTHER  -> SEDAN  (safest default; every row remapped this way is
--                        logged via RAISE NOTICE below)
--   damage_markings.view:
--     zone IS NOT NULL -> LEFT_SIDE (zone-based rows never had a real
--                          per-view placement to begin with)
--     LEFT  -> LEFT_SIDE
--     RIGHT -> RIGHT_SIDE
--     FRONT/REAR unchanged
--
-- This does not touch damage_markings.x/y/zone/damageTypeId/note/price/
-- approvalStatus — all historical marking data (type, note, price,
-- approval status) survives untouched; only the view label is remapped.

-- ---- Log which vehicles rows are about to lose their OTHER classification ----
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, make, model, "plateNumber" FROM "vehicles" WHERE "vehicleType" = 'OTHER' LOOP
    RAISE NOTICE 'vehicles.vehicleType OTHER -> SEDAN (defaulted): id=%, % % (%)', r.id, r.make, r.model, r."plateNumber";
  END LOOP;
END $$;

-- ---- VehicleType: create the new 9-value enum ----
CREATE TYPE "VehicleType_new" AS ENUM ('SEDAN', 'HATCHBACK', 'SUV', 'VAN', 'JEEP', 'CAB', 'LORRY', 'SEVEN_SEATER', 'BUS');

ALTER TABLE "vehicles" ALTER COLUMN "vehicleType" TYPE "VehicleType_new" USING (
  CASE "vehicleType"::text
    WHEN 'PICKUP' THEN 'CAB'
    WHEN 'OTHER' THEN 'SEDAN'
    ELSE "vehicleType"::text
  END
)::"VehicleType_new";

-- service_pricing has a UNIQUE(serviceId, vehicleType) constraint — an
-- OTHER row remapping to SEDAN would collide with that service's existing
-- SEDAN row. Verified beforehand that every OTHER price already equals
-- its service's SEDAN price (both come from the same seed data), so the
-- OTHER row is a pure duplicate once merged and safe to drop rather than
-- remap. PICKUP has no such collision (CAB is a brand-new category).
DELETE FROM "service_pricing" sp
WHERE sp."vehicleType" = 'OTHER'
  AND EXISTS (
    SELECT 1 FROM "service_pricing" sedan
    WHERE sedan."serviceId" = sp."serviceId" AND sedan."vehicleType" = 'SEDAN'
  );
-- Any OTHER row that somehow had no sibling SEDAN row (not the case
-- today, but keep the migration correct if it ever were) still needs a
-- value in the new enum — remap those to SEDAN same as the vehicles table.
UPDATE "service_pricing" SET "vehicleType" = 'SEDAN' WHERE "vehicleType" = 'OTHER';

ALTER TABLE "service_pricing" ALTER COLUMN "vehicleType" TYPE "VehicleType_new" USING (
  CASE "vehicleType"::text
    WHEN 'PICKUP' THEN 'CAB'
    ELSE "vehicleType"::text
  END
)::"VehicleType_new";

DROP TYPE "VehicleType";
ALTER TYPE "VehicleType_new" RENAME TO "VehicleType";

-- ---- DiagramView: create the new enum, remap damage_markings.view ----
CREATE TYPE "DiagramView" AS ENUM ('FRONT', 'REAR', 'LEFT_SIDE', 'RIGHT_SIDE');

ALTER TABLE "damage_markings" ALTER COLUMN "view" DROP DEFAULT;

ALTER TABLE "damage_markings" ALTER COLUMN "view" TYPE "DiagramView" USING (
  CASE
    WHEN "zone" IS NOT NULL THEN 'LEFT_SIDE'
    WHEN "view"::text = 'LEFT' THEN 'LEFT_SIDE'
    WHEN "view"::text = 'RIGHT' THEN 'RIGHT_SIDE'
    ELSE "view"::text
  END
)::"DiagramView";

ALTER TABLE "damage_markings" ALTER COLUMN "view" SET DEFAULT 'LEFT_SIDE';

DROP TYPE "VehicleView";
