import { apiClient } from "./client";
import type { AttendanceRecord, SalaryPayment, StaffRole, StaffUser } from "./types";

// ── Staff management (Staff page + staff profile) ──
export type DayStatus = "present" | "late" | "absent" | "leave" | "off" | "future" | "today" | "before";
export type LeaveType = "ANNUAL" | "CASUAL" | "SICK" | "UNPAID";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface MonthStats {
  month: string;
  workingDays: number;
  daysPresent: number;
  lateDays: number;
  absentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  unpaidDays: number;
  hoursWorked: number;
  overtimeHours: number;
  missingClockOuts: number;
}

export interface DaySummary {
  date: string;
  status: DayStatus;
  firstIn: string | null;
  lastOut: string | null;
  hours: number;
  leaveType?: LeaveType;
  missingClockOut?: boolean;
}

export interface StaffRow extends StaffUser {
  now: "CLOCKED_IN" | "ON_LEAVE" | "OFF" | "INACTIVE";
  clockedInAt: string | null;
  leaveToday: LeaveType | null;
  stats: MonthStats;
  jobsCompleted: number;
}

export interface StaffLeave {
  id: string;
  userId: string;
  user?: { id: string; name: string; role: StaffRole };
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decidedBy?: { name: string } | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface StaffProfile {
  user: StaffUser;
  summary: MonthStats & { days: DaySummary[] };
  payEstimate: {
    dailyRate: number;
    hourlyRate: number;
    absenceDeduction: number;
    overtimePay: number;
    epfBase: number;
    epfEmployee: number;
    epfEmployer: number;
    etfEmployer: number;
    netPay: number;
  } | null;
  records: AttendanceRecord[];
  leaves: StaffLeave[];
  salary: SalaryPayment[] | null;
  jobs: {
    count: number;
    avgMinutes: number | null;
    recent: { id: string; completedAt: string; plate: string; customer: string; isWalkIn: boolean }[];
  };
}

export async function getStaffOverview(month: string) {
  const { data } = await apiClient.get<{ month: string; pendingLeaves: number; staff: StaffRow[] }>("/users/overview", {
    params: { month },
  });
  return data;
}

export async function getStaffProfile(id: string, month: string) {
  const { data } = await apiClient.get<StaffProfile>(`/users/${id}/profile`, { params: { month } });
  return data;
}

// Attendance corrections (admin/manager)
export async function addAttendanceRecord(input: { userId: string; clockIn: string; clockOut?: string | null }) {
  const { data } = await apiClient.post<AttendanceRecord>("/attendance/records", input);
  return data;
}
export async function updateAttendanceRecord(id: string, input: { clockIn: string; clockOut?: string | null }) {
  const { data } = await apiClient.patch<AttendanceRecord>(`/attendance/records/${id}`, input);
  return data;
}
export async function deleteAttendanceRecord(id: string) {
  await apiClient.delete(`/attendance/records/${id}`);
}

// Leave
export async function listLeaves(params?: { status?: LeaveStatus; userId?: string }) {
  const { data } = await apiClient.get<StaffLeave[]>("/leaves", { params });
  return data;
}
export async function createLeave(input: {
  userId?: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason?: string;
  approve?: boolean;
}) {
  const { data } = await apiClient.post<StaffLeave>("/leaves", input);
  return data;
}
export async function decideLeave(id: string, status: "APPROVED" | "REJECTED") {
  const { data } = await apiClient.patch<StaffLeave>(`/leaves/${id}/decide`, { status });
  return data;
}
export async function deleteLeave(id: string) {
  await apiClient.delete(`/leaves/${id}`);
}

// Payroll adjustments
export async function adjustPayroll(id: string, input: { bonus: number; otherDeductions: number; note?: string | null }) {
  const { data } = await apiClient.patch<SalaryPayment>(`/payroll/${id}/adjust`, input);
  return data;
}

export const LEAVE_LABEL: Record<LeaveType, string> = {
  ANNUAL: "Annual",
  CASUAL: "Casual",
  SICK: "Sick",
  UNPAID: "Unpaid",
};

export const currentMonth = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
};

export const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

export const initials = (name: string) => {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
};

// ── EPF / ETF (Sri Lanka) ──
export interface PayrollSettings {
  epfEmployeeRate: number;
  epfEmployerRate: number;
  etfRate: number;
  employerName: string;
  employerEpfNumber: string;
  employerEtfNumber: string;
}

export interface EpfReport {
  month: string;
  settings: PayrollSettings;
  members: {
    userId: string;
    name: string;
    employeeCode: string | null;
    nic: string | null;
    epfNumber: string | null;
    status: "PENDING" | "PAID";
    epfBase: number;
    epfEmployee: number;
    epfEmployer: number;
    etfEmployer: number;
  }[];
  totals: { earnings: number; epfEmployee: number; epfEmployer: number; epfTotal: number; etf: number; employerCost: number };
  missingDetails: string[];
}

export async function getEpfReport(month: string) {
  const { data } = await apiClient.get<EpfReport>("/payroll/epf", { params: { month } });
  return data;
}
export async function getPayrollSettings() {
  const { data } = await apiClient.get<PayrollSettings>("/payroll/settings");
  return data;
}
export async function savePayrollSettings(s: PayrollSettings) {
  const { data } = await apiClient.put<PayrollSettings>("/payroll/settings", s);
  return data;
}
