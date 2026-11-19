import { apiClient } from "./client";
import type { SalaryPayment } from "./types";

export async function listPayroll(month: string): Promise<SalaryPayment[]> {
  const { data } = await apiClient.get<SalaryPayment[]>("/payroll", { params: { month } });
  return data;
}

export async function generatePayroll(month: string): Promise<SalaryPayment[]> {
  const { data } = await apiClient.post<SalaryPayment[]>("/payroll/generate", { month });
  return data;
}

export async function markPayrollPaid(id: string): Promise<SalaryPayment> {
  const { data } = await apiClient.patch<SalaryPayment>(`/payroll/${id}/pay`);
  return data;
}
