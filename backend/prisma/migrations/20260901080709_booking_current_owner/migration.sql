-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "currentOwnerUserId" TEXT;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_currentOwnerUserId_fkey" FOREIGN KEY ("currentOwnerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

