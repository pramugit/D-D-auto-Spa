-- A job card now has ONE damage inspection (stored as PRE_SERVICE) that
-- staff edit in place. Merge any extra inspections per job card (the old
-- separate post-service one, or duplicates) into the earliest inspection,
-- preferring a PRE_SERVICE one, so no marker — or approved, billed repair — is lost.
WITH ranked AS (
  SELECT id, "jobCardId",
         ROW_NUMBER() OVER (PARTITION BY "jobCardId"
                            ORDER BY (stage = 'PRE_SERVICE') DESC, "createdAt" ASC) AS rn
  FROM "damage_inspections"
),
keeper AS (SELECT "jobCardId", id AS keep_id FROM ranked WHERE rn = 1)
UPDATE "damage_markings" m
SET "damageInspectionId" = k.keep_id
FROM "damage_inspections" d
JOIN keeper k ON k."jobCardId" = d."jobCardId"
WHERE m."damageInspectionId" = d.id AND d.id <> k.keep_id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "jobCardId"
                                ORDER BY (stage = 'PRE_SERVICE') DESC, "createdAt" ASC) AS rn
  FROM "damage_inspections"
)
DELETE FROM "damage_inspections" WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

UPDATE "damage_inspections" SET stage = 'PRE_SERVICE' WHERE stage <> 'PRE_SERVICE';
