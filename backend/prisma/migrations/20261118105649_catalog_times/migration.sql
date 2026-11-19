-- AlterTable
ALTER TABLE "damage_types" ADD COLUMN     "repairMinutes" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "service_packages" ADD COLUMN     "durationMinutes" INTEGER;

