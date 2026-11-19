-- CreateEnum
CREATE TYPE "DamageSeverity" AS ENUM ('MINOR', 'MODERATE', 'SEVERE');

-- AlterTable
ALTER TABLE "damage_markings" ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "severity" "DamageSeverity" NOT NULL DEFAULT 'MINOR';
