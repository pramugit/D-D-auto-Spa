import type { AttendanceRecord, LeaveType, Prisma, StaffLeave } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { computeEpf, getPayrollSettings, type PayrollSettings } from "./epfService";

/**
 * Staff management maths shared by the Staff pages, Attendance and Payroll.
 * Everything is in the shop's local time (the server runs at the shop).
 * Working days are Monday–Saturday; a staff member's shift ("HH:MM"–"HH:MM")
 * decides late arrivals (10-minute grace), overtime and the hourly rate.
 */

export const LATE_GRACE_MINUTES = 10;
export const OVERTIME_MULTIPLIER = 1.5;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new AppError(400, "month must be YYYY-MM");
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

export const currentMonth = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
};

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

export const isWorkingDay = (d: Date) => d.getDay() !== 0; // Mon–Sat

export function workingDaysIn(month: string) {
  const { start, end } = monthBounds(month);
  let n = 0;
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) if (isWorkingDay(d)) n++;
  return n;
}

/** A @db.Date column comes back as UTC midnight — read its calendar date. */
const dateOnly = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export type DayStatus = "present" | "late" | "absent" | "leave" | "off" | "future" | "today" | "before";

export interface DaySummary {
  date: string;
  status: DayStatus;
  firstIn: string | null;
  lastOut: string | null;
  hours: number;
  leaveType?: LeaveType;
  missingClockOut?: boolean;
}

export interface MonthSummary {
  month: string;
  workingDays: number; // in the whole month — the payroll divisor
  daysPresent: number;
  lateDays: number;
  absentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  unpaidDays: number; // absent + unpaid leave
  hoursWorked: number;
  overtimeHours: number;
  missingClockOuts: number;
  days: DaySummary[];
}

type StaffForSummary = { shiftStart: string; shiftEnd: string; joinedAt: Date | null; createdAt: Date };

export function summarizeMonth(
  staff: StaffForSummary,
  month: string,
  records: Pick<AttendanceRecord, "clockIn" | "clockOut">[],
  leaves: Pick<StaffLeave, "type" | "startDate" | "endDate" | "status">[],
  now = new Date()
): MonthSummary {
  const { start, end } = monthBounds(month);
  const shiftStart = minutesOf(staff.shiftStart);
  const shiftHours = Math.max(1, (minutesOf(staff.shiftEnd) - shiftStart) / 60);
  const firstDay = staff.joinedAt ? dateOnly(staff.joinedAt) : new Date(staff.createdAt.getFullYear(), staff.createdAt.getMonth(), staff.createdAt.getDate());
  const todayKey = dayKey(now);

  const byDay = new Map<string, Pick<AttendanceRecord, "clockIn" | "clockOut">[]>();
  for (const r of records) {
    const k = dayKey(r.clockIn);
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }
  const approved = leaves.filter((l) => l.status === "APPROVED").map((l) => ({ ...l, from: dateOnly(l.startDate), to: dateOnly(l.endDate) }));

  const s: MonthSummary = {
    month,
    workingDays: workingDaysIn(month),
    daysPresent: 0,
    lateDays: 0,
    absentDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    unpaidDays: 0,
    hoursWorked: 0,
    overtimeHours: 0,
    missingClockOuts: 0,
    days: [],
  };

  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d);
    const recs = (byDay.get(key) ?? []).sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());
    const leave = approved.find((l) => l.from <= d && d <= l.to);
    const day: DaySummary = { date: key, status: "absent", firstIn: null, lastOut: null, hours: 0 };

    if (recs.length) {
      let hours = 0;
      for (const r of recs) {
        const out = r.clockOut ?? (key === todayKey ? now : null);
        if (out) hours += (out.getTime() - r.clockIn.getTime()) / 3600000;
        else day.missingClockOut = true;
      }
      const first = recs[0].clockIn;
      const late = first.getHours() * 60 + first.getMinutes() > shiftStart + LATE_GRACE_MINUTES;
      day.status = late ? "late" : "present";
      day.firstIn = first.toISOString();
      const lastOut = recs[recs.length - 1].clockOut;
      day.lastOut = lastOut ? lastOut.toISOString() : null;
      day.hours = round2(hours);
      s.daysPresent++;
      if (late) s.lateDays++;
      if (day.missingClockOut) s.missingClockOuts++;
      s.hoursWorked += hours;
      // Overtime only counts on finished days.
      if (key !== todayKey) s.overtimeHours += Math.max(0, hours - shiftHours);
    } else if (d < firstDay) {
      day.status = "before";
    } else if (key > todayKey) {
      day.status = leave ? "leave" : "future";
      if (leave) day.leaveType = leave.type;
    } else if (!isWorkingDay(d)) {
      day.status = "off";
    } else if (leave) {
      day.status = "leave";
      day.leaveType = leave.type;
      if (leave.type === "UNPAID") s.unpaidLeaveDays++;
      else s.paidLeaveDays++;
    } else if (key === todayKey) {
      day.status = "today"; // not clocked in yet — not counted absent until the day is over
    } else {
      s.absentDays++;
    }
    s.days.push(day);
  }

  s.hoursWorked = round2(s.hoursWorked);
  s.overtimeHours = round2(s.overtimeHours);
  s.unpaidDays = s.absentDays + s.unpaidLeaveDays;
  return s;
}

/**
 * Salary maths for one month: deduction for unpaid days, overtime at 1.5×,
 * and EPF/ETF on the basic salary earned (employee EPF is deducted).
 */
export function computePay(
  baseSalary: number,
  staff: { shiftStart: string; shiftEnd: string; epfMember: boolean },
  sum: MonthSummary,
  epfSettings: PayrollSettings,
  bonus = 0,
  otherDeductions = 0
) {
  const shiftHours = Math.max(1, (minutesOf(staff.shiftEnd) - minutesOf(staff.shiftStart)) / 60);
  const daily = sum.workingDays ? baseSalary / sum.workingDays : 0;
  const hourly = daily / shiftHours;
  const absenceDeduction = round2(Math.min(baseSalary, sum.unpaidDays * daily));
  const overtimePay = round2(sum.overtimeHours * hourly * OVERTIME_MULTIPLIER);
  const epf = computeEpf(baseSalary, absenceDeduction, staff.epfMember, epfSettings);
  const netPay = round2(Math.max(0, baseSalary + overtimePay + bonus - absenceDeduction - otherDeductions - epf.epfEmployee));
  return { dailyRate: round2(daily), hourlyRate: round2(hourly), absenceDeduction, overtimePay, ...epf, netPay };
}

async function monthData(userIds: string[], month: string) {
  const { start, end } = monthBounds(month);
  const [records, leaves] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { userId: { in: userIds }, clockIn: { gte: start, lt: end } } }),
    prisma.staffLeave.findMany({
      where: { userId: { in: userIds }, status: "APPROVED", startDate: { lt: end }, endDate: { gte: start } },
    }),
  ]);
  return { records, leaves };
}

export async function summaryFor(user: StaffForSummary & { id: string }, month: string) {
  const { records, leaves } = await monthData([user.id], month);
  return summarizeMonth(user, month, records, leaves);
}

// ── Staff list / profile ─────────────────────────────────────────────────
const SENSITIVE: (keyof Prisma.UserSelect)[] = ["monthlySalary", "hourlyRate", "nic", "bankName", "bankAccount", "epfNumber"];

export const staffSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  hourlyRate: true,
  monthlySalary: true,
  createdAt: true,
  active: true,
  employeeCode: true,
  joinedAt: true,
  nic: true,
  address: true,
  emergencyName: true,
  emergencyPhone: true,
  bankName: true,
  bankAccount: true,
  shiftStart: true,
  shiftEnd: true,
  epfMember: true,
  epfNumber: true,
} satisfies Prisma.UserSelect;

/** Salary, NIC and bank details are only for admins (payroll access). */
export function redact<T extends Record<string, unknown>>(u: T, isAdmin: boolean): T {
  if (isAdmin) return u;
  const copy = { ...u };
  for (const k of SENSITIVE) delete copy[k as string];
  return copy;
}

export async function listStaff(month: string, isAdmin: boolean) {
  const users = await prisma.user.findMany({ select: staffSelect, orderBy: [{ active: "desc" }, { name: "asc" }] });
  const ids = users.map((u) => u.id);
  const { start, end } = monthBounds(month);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [{ records, leaves }, openNow, leaveToday, jobs] = await Promise.all([
    monthData(ids, month),
    prisma.attendanceRecord.findMany({ where: { clockOut: null, clockIn: { gte: todayStart } }, select: { userId: true, clockIn: true } }),
    prisma.staffLeave.findMany({
      where: { status: "APPROVED", startDate: { lte: todayStart }, endDate: { gte: todayStart } },
      select: { userId: true, type: true },
    }),
    prisma.jobCardTechnician.findMany({
      where: { jobCard: { status: "COMPLETED", completedAt: { gte: start, lt: end } } },
      select: { userId: true },
    }),
  ]);
  const pending = await prisma.staffLeave.count({ where: { status: "PENDING" } });

  return {
    month,
    pendingLeaves: pending,
    staff: users.map((u) => {
      const sum = summarizeMonth(
        u,
        month,
        records.filter((r) => r.userId === u.id),
        leaves.filter((l) => l.userId === u.id)
      );
      const open = openNow.find((o) => o.userId === u.id);
      const onLeave = leaveToday.find((l) => l.userId === u.id);
      const { days: _days, ...stats } = sum;
      return {
        ...redact(u, isAdmin),
        now: !u.active ? "INACTIVE" : open ? "CLOCKED_IN" : onLeave ? "ON_LEAVE" : "OFF",
        clockedInAt: open?.clockIn ?? null,
        leaveToday: onLeave?.type ?? null,
        stats,
        jobsCompleted: jobs.filter((j) => j.userId === u.id).length,
      };
    }),
  };
}

export async function getProfile(id: string, month: string, isAdmin: boolean) {
  const user = await prisma.user.findUnique({ where: { id }, select: staffSelect });
  if (!user) throw new AppError(404, "Staff member not found");
  const { start, end } = monthBounds(month);
  const [{ records, leaves: monthLeaves }, allLeaves, salary, jobs] = await Promise.all([
    monthData([id], month),
    prisma.staffLeave.findMany({
      where: { userId: id },
      orderBy: { startDate: "desc" },
      take: 50,
      include: { decidedBy: { select: { name: true } } },
    }),
    isAdmin ? prisma.salaryPayment.findMany({ where: { userId: id }, orderBy: { month: "desc" }, take: 24 }) : Promise.resolve(null),
    prisma.jobCardTechnician.findMany({
      where: { userId: id, jobCard: { status: "COMPLETED", completedAt: { gte: start, lt: end } } },
      select: {
        jobCard: {
          select: {
            id: true,
            startedAt: true,
            completedAt: true,
            booking: { select: { isWalkIn: true, vehicle: { select: { plateNumber: true } }, customer: { select: { name: true } } } },
          },
        },
      },
      orderBy: { jobCard: { completedAt: "desc" } },
    }),
  ]);
  const summary = summarizeMonth(user, month, records, monthLeaves);
  const pay =
    isAdmin && user.monthlySalary !== null
      ? computePay(Number(user.monthlySalary), user, summary, await getPayrollSettings())
      : null;
  const timed = jobs.filter((j) => j.jobCard.startedAt && j.jobCard.completedAt);
  return {
    user: redact(user, isAdmin),
    summary,
    payEstimate: pay,
    records: records.sort((a, b) => b.clockIn.getTime() - a.clockIn.getTime()),
    leaves: allLeaves,
    salary,
    jobs: {
      count: jobs.length,
      avgMinutes: timed.length
        ? Math.round(timed.reduce((s, j) => s + (j.jobCard.completedAt!.getTime() - j.jobCard.startedAt!.getTime()) / 60000, 0) / timed.length)
        : null,
      recent: jobs.slice(0, 10).map((j) => ({
        id: j.jobCard.id,
        completedAt: j.jobCard.completedAt,
        plate: j.jobCard.booking.vehicle?.plateNumber ?? "",
        customer: j.jobCard.booking.customer?.name ?? "",
        isWalkIn: j.jobCard.booking.isWalkIn,
      })),
    },
  };
}

/**
 * A free 4-digit employee code (1000–9999). It doubles as the staff
 * member's clock-in PIN at the Attendance kiosk, so it's random rather
 * than sequential — sequential codes would let anyone guess a
 * colleague's code and clock them in.
 */
export async function nextEmployeeCode() {
  const taken = new Set(
    (await prisma.user.findMany({ where: { employeeCode: { not: null } }, select: { employeeCode: true } })).map(
      (u) => u.employeeCode,
    ),
  );
  if (taken.size >= 9000) throw new AppError(409, "No free 4-digit employee codes left");
  for (;;) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    if (!taken.has(code)) return code;
  }
}

// ── Leave ────────────────────────────────────────────────────────────────
export function leaveDays(from: Date, to: Date) {
  let n = 0;
  for (let d = dateOnly(from); d <= dateOnly(to); d.setDate(d.getDate() + 1)) if (isWorkingDay(d)) n++;
  return n;
}

export { round1 };
