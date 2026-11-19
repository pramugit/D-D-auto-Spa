-- AlterEnum
ALTER TYPE "NotificationStatus" ADD VALUE 'FAILED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'JOB_QUALITY_CHECK';
ALTER TYPE "NotificationType" ADD VALUE 'PHOTO_UPDATE';
