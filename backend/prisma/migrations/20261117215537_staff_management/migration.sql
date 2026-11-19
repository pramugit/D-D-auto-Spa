-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'CASUAL', 'SICK', 'UNPAID');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "salary_payments" ADD COLUMN     "absenceDeduction" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "bonus" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "daysPresent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hoursWorked" DECIMAL(7,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lateDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "netPay" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "otherDeductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "overtimeHours" DECIMAL(7,2) NOT NULL DEFAULT 0,
ADD COLUMN     "overtimePay" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paidLeaveDays" DECIMAL(5,1) NOT NULL DEFAULT 0,
ADD COLUMN     "unpaidDays" DECIMAL(5,1) NOT NULL DEFAULT 0,
ADD COLUMN     "workingDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "emergencyName" TEXT,
ADD COLUMN     "emergencyPhone" TEXT,
ADD COLUMN     "employeeCode" TEXT,
ADD COLUMN     "joinedAt" DATE,
ADD COLUMN     "nic" TEXT,
ADD COLUMN     "shiftEnd" TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN     "shiftStart" TEXT NOT NULL DEFAULT '08:00';

-- CreateTable
CREATE TABLE "staff_leaves" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_leaves_userId_startDate_idx" ON "staff_leaves"("userId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeCode_key" ON "users"("employeeCode");

-- AddForeignKey
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing payroll rows: net pay = base salary (nothing else was tracked before).
UPDATE "salary_payments" SET "netPay" = "baseSalary" WHERE "netPay" = 0;
