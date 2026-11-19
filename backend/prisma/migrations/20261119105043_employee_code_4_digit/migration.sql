-- Employee codes are now exactly 4 digits and double as the staff
-- member's Attendance kiosk PIN. Give every staff member without a valid
-- 4-digit code (old "EMP-001" style, free text, or none) a random unused one.
DO $$
DECLARE
  r RECORD;
  c TEXT;
BEGIN
  FOR r IN SELECT id FROM "users" WHERE "employeeCode" IS NULL OR "employeeCode" !~ '^[0-9]{4}$' LOOP
    LOOP
      c := (1000 + floor(random() * 9000))::int::text;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "users" WHERE "employeeCode" = c);
    END LOOP;
    UPDATE "users" SET "employeeCode" = c WHERE id = r.id;
  END LOOP;
END $$;
