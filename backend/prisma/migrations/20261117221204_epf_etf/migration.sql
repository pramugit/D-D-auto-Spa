-- AlterTable
ALTER TABLE "salary_payments" ADD COLUMN     "epfBase" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "epfEmployee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "epfEmployer" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "etfEmployer" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "epfMember" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "epfNumber" TEXT;

