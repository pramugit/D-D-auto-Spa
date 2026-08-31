import { apiClient } from "./client";
import type { Invoice, PaymentMethod } from "./types";

export async function listInvoices(status?: string): Promise<Invoice[]> {
  const { data } = await apiClient.get<Invoice[]>("/invoices", { params: status ? { status } : undefined });
  return data;
}

export async function getInvoice(id: string): Promise<Invoice> {
  const { data } = await apiClient.get<Invoice>(`/invoices/${id}`);
  return data;
}

export async function createInvoice(jobCardId: string, taxRate?: number, discount?: number): Promise<Invoice> {
  const { data } = await apiClient.post<Invoice>(`/job-cards/${jobCardId}/invoice`, { taxRate, discount });
  return data;
}

export async function submitPayment(
  invoiceId: string,
  method: PaymentMethod,
  amount: number,
  slip?: File | null
) {
  const form = new FormData();
  form.append("method", method);
  form.append("amount", String(amount));
  if (slip) form.append("slip", slip);
  const { data } = await apiClient.post(`/invoices/${invoiceId}/payments`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function verifyPayment(paymentId: string, status: "VERIFIED" | "REJECTED") {
  const { data } = await apiClient.patch(`/payments/${paymentId}/verify`, { status });
  return data;
}
