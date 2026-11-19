-- CreateEnum
CREATE TYPE "JobNotificationType" AS ENUM ('PHOTOS_SENT', 'PHOTOS_OVERDUE');

-- CreateTable
CREATE TABLE "job_notifications" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "type" "JobNotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "statusAtEvent" "BookingStatus" NOT NULL,
    "technicianId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_notifications_jobCardId_createdAt_idx" ON "job_notifications"("jobCardId", "createdAt");

-- AddForeignKey
ALTER TABLE "job_notifications" ADD CONSTRAINT "job_notifications_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "job_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_notifications" ADD CONSTRAINT "job_notifications_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
