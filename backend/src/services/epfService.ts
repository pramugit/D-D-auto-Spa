import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

/**
 * Sri Lanka EPF / ETF.
 *  - EPF: employee 8% (deducted from pay) + employer 12%
 *  - ETF: employer 3%
 * Worked out on the basic salary actually earned for the month (monthly
 * salary minus the unpaid-day deduction). Overtime and bonuses are not
 * included. Rates and the employer's registration numbers are editable
 * (Staff → EPF / ETF → Settings), stored privately in site_content.
 */
export interface PayrollSettings {
  epfEmployeeRate: number; // %
  epfEmployerRate: number; // %
  etfRate: number; // %
  employerName: string;
  employerEpfNumber: string; // EPF registration no. of the business
  employerEtfNumber: string;
}

const KEY = "payroll-settings";
const DEFAULTS: PayrollSettings = {
  epfEmployeeRate: 8,
  epfEmployerRate: 12,
  etfRate: 3,
  employerName: "D & D Auto Spa",
  employerEpfNumber: "",
  employerEtfNumber: "",
};

export async function getPayrollSettings(): Promise<PayrollSettings> {
  const row = await prisma.siteContent.findUnique({ where: { key: KEY } });
  return { ...DEFAULTS, ...((row?.data as Partial<PayrollSettings> | null) ?? {}) };
}

export async function savePayrollSettings(patch: Partial<PayrollSettings>) {
  const next = { ...(await getPayrollSettings()), ...patch };
  for (const k of ["epfEmployeeRate", "epfEmployerRate", "etfRate"] as const) {
    if (!(next[k] >= 0 && next[k] <= 50)) throw new AppError(400, "Rates must be between 0 and 50%");
  }
  await prisma.siteContent.upsert({
    where: { key: KEY },
    update: { data: next as object },
    create: { key: KEY, data: next as object },
  });
  return next;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeEpf(baseSalary: number, absenceDeduction: number, member: boolean, s: PayrollSettings) {
  if (!member) return { epfBase: 0, epfEmployee: 0, epfEmployer: 0, etfEmployer: 0 };
  const epfBase = round2(Math.max(0, baseSalary - absenceDeduction));
  return {
    epfBase,
    epfEmployee: round2((epfBase * s.epfEmployeeRate) / 100),
    epfEmployer: round2((epfBase * s.epfEmployerRate) / 100),
    etfEmployer: round2((epfBase * s.etfRate) / 100),
  };
}

/** Monthly contribution report (from generated payroll), like EPF Form C / ETF R4. */
export async function epfReport(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new AppError(400, "month must be YYYY-MM");
  const [y, m] = month.split("-").map(Number);
  const settings = await getPayrollSettings();
  const rows = await prisma.salaryPayment.findMany({
    where: { month: new Date(Date.UTC(y, m - 1, 1)), epfBase: { gt: 0 } },
    include: { user: { select: { id: true, name: true, nic: true, epfNumber: true, employeeCode: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const members = rows.map((r) => ({
    userId: r.user.id,
    name: r.user.name,
    employeeCode: r.user.employeeCode,
    nic: r.user.nic,
    epfNumber: r.user.epfNumber,
    status: r.status,
    epfBase: Number(r.epfBase),
    epfEmployee: Number(r.epfEmployee),
    epfEmployer: Number(r.epfEmployer),
    etfEmployer: Number(r.etfEmployer),
  }));
  const sum = (k: "epfBase" | "epfEmployee" | "epfEmployer" | "etfEmployer") => round2(members.reduce((s, r) => s + r[k], 0));
  const epfTotal = round2(sum("epfEmployee") + sum("epfEmployer"));
  // Missing details the EPF/ETF returns need.
  const missing = members.filter((r) => !r.epfNumber || !r.nic).map((r) => r.name);
  return {
    month,
    settings,
    members,
    totals: {
      earnings: sum("epfBase"),
      epfEmployee: sum("epfEmployee"),
      epfEmployer: sum("epfEmployer"),
      epfTotal,
      etf: sum("etfEmployer"),
      employerCost: round2(sum("epfEmployer") + sum("etfEmployer")),
    },
    missingDetails: missing,
  };
}
