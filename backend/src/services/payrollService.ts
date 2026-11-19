import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { computePay, monthBounds, summaryFor } from "./staffService";
import { getPayrollSettings } from "./epfService";

/** "YYYY-MM" -> the 1st of that month, UTC midnight (matches the @db.Date column). */
function monthToDate(month: string): Date {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1));
}

const payrollInclude = {
  user: {
    select: {
      id: true,
      name: true,
      role: true,
      employeeCode: true,
      bankName: true,
      bankAccount: true,
      shiftStart: true,
      shiftEnd: true,
      nic: true,
      epfNumber: true,
      epfMember: true,
    },
  },
} as const;

/**
 * Builds (or refreshes) each salaried, active staff member's payroll for
 * the month from their attendance and leave: days present, unpaid days
 * (absences + unpaid leave) deducted at the daily rate, overtime paid at
 * 1.5×. Rows already PAID are never touched; PENDING rows are recalculated
 * (keeping the admin's bonus / other deductions / note). baseSalary is the
 * salary at first generation, so a later salary change doesn't rewrite a
 * month that was already generated.
 */
export async function generateForMonth(month: string) {
  monthBounds(month); // validates
  const monthDate = monthToDate(month);
  const staff = await prisma.user.findMany({
    where: { monthlySalary: { not: null }, active: true },
    select: { id: true, monthlySalary: true, shiftStart: true, shiftEnd: true, joinedAt: true, createdAt: true, epfMember: true },
  });
  const epfSettings = await getPayrollSettings();
  const existing = await prisma.salaryPayment.findMany({ where: { month: monthDate } });

  for (const s of staff) {
    const row = existing.find((e) => e.userId === s.id);
    if (row?.status === "PAID") continue;
    const base = row ? Number(row.baseSalary) : Number(s.monthlySalary);
    const sum = await summaryFor(s, month);
    const pay = computePay(base, s, sum, epfSettings, Number(row?.bonus ?? 0), Number(row?.otherDeductions ?? 0));
    const data = {
      workingDays: sum.workingDays,
      daysPresent: sum.daysPresent,
      lateDays: sum.lateDays,
      paidLeaveDays: sum.paidLeaveDays,
      unpaidDays: sum.unpaidDays,
      hoursWorked: sum.hoursWorked,
      overtimeHours: sum.overtimeHours,
      overtimePay: pay.overtimePay,
      absenceDeduction: pay.absenceDeduction,
      epfBase: pay.epfBase,
      epfEmployee: pay.epfEmployee,
      epfEmployer: pay.epfEmployer,
      etfEmployer: pay.etfEmployer,
      netPay: pay.netPay,
    };
    if (row) await prisma.salaryPayment.update({ where: { id: row.id }, data });
    else await prisma.salaryPayment.create({ data: { userId: s.id, month: monthDate, baseSalary: base, ...data } });
  }
  return listForMonth(month);
}

export async function listForMonth(month: string) {
  const monthDate = monthToDate(month);
  return prisma.salaryPayment.findMany({
    where: { month: monthDate },
    include: payrollInclude,
    orderBy: { user: { name: "asc" } },
  });
}

/** Admin's manual bonus / other deductions before paying. */
export async function adjust(id: string, input: { bonus: number; otherDeductions: number; note?: string | null }) {
  const row = await prisma.salaryPayment.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "Payroll record not found");
  if (row.status === "PAID") throw new AppError(400, "Already paid — it can't be changed");
  const netPay =
    Math.round(
      Math.max(
        0,
        Number(row.baseSalary) +
          Number(row.overtimePay) +
          input.bonus -
          Number(row.absenceDeduction) -
          input.otherDeductions -
          Number(row.epfEmployee)
      ) * 100
    ) / 100;
  return prisma.salaryPayment.update({
    where: { id },
    data: { bonus: input.bonus, otherDeductions: input.otherDeductions, note: input.note ?? null, netPay },
    include: payrollInclude,
  });
}

export async function markPaid(id: string) {
  const record = await prisma.salaryPayment.findUnique({ where: { id } });
  if (!record) throw new AppError(404, "Payroll record not found");
  if (record.status === "PAID") throw new AppError(400, "Already marked paid");
  return prisma.salaryPayment.update({ where: { id }, data: { status: "PAID", paidAt: new Date() } });
}
