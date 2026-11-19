-- CreateEnum
CREATE TYPE "BookingRequestStage" AS ENUM ('REQUESTED', 'TIME_PROPOSED', 'ACCEPTED');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "contactVia" TEXT,
ADD COLUMN     "customerMessage" TEXT,
ADD COLUMN     "preferredFrom" TEXT,
ADD COLUMN     "preferredTime" TEXT,
ADD COLUMN     "preferredTo" TEXT,
ADD COLUMN     "proposedAt" TIMESTAMP(3),
ADD COLUMN     "requestStage" "BookingRequestStage",
ADD COLUMN     "staffNote" TEXT;

