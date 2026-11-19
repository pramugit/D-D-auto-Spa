-- AlterTable
ALTER TABLE "damage_markings" ADD COLUMN     "foundDuringWork" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "job_cards" ADD COLUMN     "bayCheckedInAt" TIMESTAMP(3),
ADD COLUMN     "cooldownDoneAt" TIMESTAMP(3),
ADD COLUMN     "cooldownMinutes" INTEGER,
ADD COLUMN     "cooldownStartedAt" TIMESTAMP(3),
ADD COLUMN     "customerWaiting" TEXT,
ADD COLUMN     "promisedReadyAt" TIMESTAMP(3),
ADD COLUMN     "timingSentAt" TIMESTAMP(3);

