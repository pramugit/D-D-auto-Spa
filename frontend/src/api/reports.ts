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

export interface ProfitReport {
  overTime: { jobCardCount: number; revenue: number; materialCost: number; laborCost: number; profit: number };
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
  customer: { id: string; name: string };
  vehicle: { plateNumber: string; make: string; model: string };
}

export async function getSatisfactionAlerts(): Promise<SatisfactionAlert[]> {
  const { data } = await apiClient.get<SatisfactionAlert[]>("/reports/satisfaction-alerts");
  return data;
}
