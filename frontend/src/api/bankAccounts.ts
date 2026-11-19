import { apiClient } from "./client";
import type { BankAccount } from "./types";

export async function listBankAccounts(): Promise<BankAccount[]> {
  const { data } = await apiClient.get<BankAccount[]>("/bank-accounts");
  return data;
}

export async function createBankAccount(input: {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch?: string;
  active?: boolean;
}): Promise<BankAccount> {
  const { data } = await apiClient.post<BankAccount>("/bank-accounts", input);
  return data;
}

export async function updateBankAccount(
  id: string,
  input: Partial<{ bankName: string; accountName: string; accountNumber: string; branch: string; active: boolean }>
): Promise<BankAccount> {
  const { data } = await apiClient.patch<BankAccount>(`/bank-accounts/${id}`, input);
  return data;
}

export async function deleteBankAccount(id: string): Promise<void> {
  await apiClient.delete(`/bank-accounts/${id}`);
}
