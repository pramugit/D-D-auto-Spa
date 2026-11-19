import { apiClient } from "./client";
import type { StaffRole, StaffUser } from "./types";

export async function listUsers(): Promise<StaffUser[]> {
  const { data } = await apiClient.get<StaffUser[]>("/users");
  return data;
}

/** Narrow technician roster for the Job Board "assign technician" checklist. */
export async function listTechnicians(): Promise<Pick<StaffUser, "id" | "name" | "email" | "role">[]> {
  const { data } = await apiClient.get("/users/technicians");
  return data;
}

export type StaffDetailsInput = Partial<{
  employeeCode: string | null;
  joinedAt: string | null;
  nic: string | null;
  address: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  bankName: string | null;
  bankAccount: string | null;
  shiftStart: string;
  shiftEnd: string;
  epfMember: boolean;
  epfNumber: string | null;
}>;

export async function createUser(
  input: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    role: StaffRole;
    monthlySalary?: number;
  } & StaffDetailsInput
): Promise<StaffUser> {
  const { data } = await apiClient.post<StaffUser>("/users", input);
  return data;
}

export async function updateUser(
  id: string,
  input: Partial<{
    name: string;
    email: string;
    phone: string;
    role: StaffRole;
    password: string;
    monthlySalary: number | null;
    active: boolean;
  }> &
    StaffDetailsInput
): Promise<StaffUser> {
  const { data } = await apiClient.patch<StaffUser>(`/users/${id}`, input);
  return data;
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/users/${id}`);
}
