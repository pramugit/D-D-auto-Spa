import { apiClient } from "./client";

export interface RevenuePoint {
  period: string;
  revenue: number;
}

export interface TopService {
  name: string;
  count: number;
  revenue: number;
}

export interface TechnicianStat {
  technicianId: string;
  name: string;
  jobCount: number;
  completedCount: number;
  avgCompletionMinutes: number | null;
}

export interface BayUtilization {
  bayId: string;
  name: string;
  bookedMinutes: number;
  availableMinutes: number;
  utilizationRate: number;
}

export interface RepeatCustomerRate {
  totalCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
}

export async function getRevenue(granularity: "daily" | "weekly" | "monthly"): Promise<RevenuePoint[]> {
  const { data } = await apiClient.get<RevenuePoint[]>("/reports/revenue", { params: { granularity } });
  return data;
}

export async function getTopServices(): Promise<TopService[]> {
  const { data } = await apiClient.get<TopService[]>("/reports/top-services");
  return data;
}

export async function getTechnicianStats(): Promise<TechnicianStat[]> {
  const { data } = await apiClient.get<TechnicianStat[]>("/reports/technicians");
  return data;
}

export async function getBayUtilization(): Promise<BayUtilization[]> {
  const { data } = await apiClient.get<BayUtilization[]>("/reports/bay-utilization");
  return data;
}

export async function getRepeatCustomerRate(): Promise<RepeatCustomerRate> {
  const { data } = await apiClient.get<RepeatCustomerRate>("/reports/repeat-customers");
  return data;
}

export type ProfitTotals = { jobCardCount: number; revenue: number; materialCost: number; laborCost: number; profit: number };

export interface ProfitReport {
  overTime: ProfitTotals;
  /** Daily Jobs (walk-ins) vs scheduled bookings. */
  split: { daily: ProfitTotals; booking: ProfitTotals };
  byCategory: { EXTERIOR: number; INTERIOR: number };
  byTechnician: { technicianId: string; name: string; profit: number }[];
}

export async function getProfitReport(from?: string, to?: string): Promise<ProfitReport> {
  const { data } = await apiClient.get<ProfitReport>("/reports/profit", { params: { from, to } });
  return data;
}

export interface SatisfactionReport {
  overall: { averageRating: number | null; reviewCount: number };
  byTechnician: { technicianId: string; name: string; averageRating: number; reviewCount: number }[];
  byCategory: { EXTERIOR: number | null; INTERIOR: number | null };
}

export async function getSatisfactionReport(from?: string, to?: string): Promise<SatisfactionReport> {
  const { data } = await apiClient.get<SatisfactionReport>("/reports/satisfaction", { params: { from, to } });
  return data;
}

export interface SatisfactionAlert {
  reviewId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  bookingId: string;
  jobCardId: string;
  isWalkIn: boolean;
  customer: { id: string; name: string };
  vehicle: { plateNumber: string; make: string; model: string };
}

export async function getSatisfactionAlerts(): Promise<SatisfactionAlert[]> {
  const { data } = await apiClient.get<SatisfactionAlert[]>("/reports/satisfaction-alerts");
  return data;
}

// ── Income dashboard (Invoices page) ──
export interface IncomeJob {
  id: string;
  completedAt: string;
  isWalkIn: boolean;
  total: number;
  tax: number;
  discount: number;
  paid: boolean;
  items: { name: string; isPackage: boolean; price: number }[];
}

export interface IncomePayment {
  createdAt: string;
  method: "CASH" | "CARD" | "BANK_TRANSFER" | "QR";
  amount: number;
  isWalkIn: boolean;
}

export interface IncomeData {
  from: string;
  to: string;
  jobs: IncomeJob[];
  payments: IncomePayment[];
  outstanding: { walkIn: number; booking: number; invoices: number };
  pendingVerification: { count: number; amount: number };
}

export async function getIncome(from: Date, to: Date): Promise<IncomeData> {
  const { data } = await apiClient.get<IncomeData>("/reports/income", {
    params: { from: from.toISOString(), to: to.toISOString() },
  });
  return data;
}

// ── Reports page (automatic summary + daily WhatsApp report) ──
export interface ReportSummary {
  from: string;
  to: string;
  kpis: {
    revenue: { value: number; prev: number; change: number | null };
    jobs: { value: number; prev: number; change: number | null; daily: number; booking: number };
    avgJob: { value: number };
    newCustomers: { value: number; prev: number; change: number | null };
    profit: { value: number; revenue: number; materialCost: number; laborCost: number };
    repeatRate: number;
  };
  payments: { createdAt: string; amount: number; isWalkIn: boolean }[];
  byMethod: Record<string, number>;
  topServices: { name: string; count: number; revenue: number }[];
  technicians: { name: string; jobs: number; avgMinutes: number | null }[];
  bays: { bayId: string; name: string; utilizationRate: number }[];
  alerts: {
    outstanding: number;
    outstandingCount: number;
    pendingTransfers: number;
    lowStock: string[];
    waiting: number;
    inProgress: number;
    ready: number;
  };
  insights: { tone: "good" | "bad" | "info"; text: string }[];
}

export async function getReportSummary(from: Date, to: Date): Promise<ReportSummary> {
  const { data } = await apiClient.get<ReportSummary>("/reports/summary", {
    params: { from: from.toISOString(), to: to.toISOString() },
  });
  return data;
}

export interface DailyReportSettings {
  enabled: boolean;
  whatsappNumber: string;
  hour: number;
  lastSentDate?: string | null;
}

export async function getDailyReportSettings(): Promise<DailyReportSettings> {
  const { data } = await apiClient.get<DailyReportSettings>("/reports/daily-settings");
  return data;
}

export async function saveDailyReportSettings(s: { enabled: boolean; whatsappNumber: string; hour: number }) {
  const { data } = await apiClient.put<DailyReportSettings>("/reports/daily-settings", s);
  return data;
}

export async function previewDailyReport(): Promise<string> {
  const { data } = await apiClient.get<{ text: string }>("/reports/daily-summary/preview");
  return data.text;
}

export async function sendDailyReportNow(): Promise<{ text: string; sentTo: string; live: boolean }> {
  const { data } = await apiClient.post<{ text: string; sentTo: string; live: boolean }>("/reports/daily-summary/send");
  return data;
}
