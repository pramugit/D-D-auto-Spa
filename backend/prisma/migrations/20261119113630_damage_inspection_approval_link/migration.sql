-- AlterEnum
ALTER TYPE "JobNotificationType" ADD VALUE 'INSPECTION_CONFIRMED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'INSPECTION_REPORT';

-- AlterTable
ALTER TABLE "damage_inspections" ADD COLUMN     "acknowledgedVia" TEXT,
ADD COLUMN     "approvalToken" TEXT,
ADD COLUMN     "customerComment" TEXT,
ADD COLUMN     "sentToCustomerAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "damage_inspections_approvalToken_key" ON "damage_inspections"("approvalToken");

