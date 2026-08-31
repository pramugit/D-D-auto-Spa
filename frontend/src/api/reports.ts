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
