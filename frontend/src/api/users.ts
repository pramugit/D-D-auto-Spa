import { apiClient } from "./client";
import type { StaffRole, StaffUser } from "./types";

export async function listUsers(): Promise<StaffUser[]> {
  const { data } = await apiClient.get<StaffUser[]>("/users");
  return data;
}

export async function createUser(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: StaffRole;
}): Promise<StaffUser> {
  const { data } = await apiClient.post<StaffUser>("/users", input);
  return data;
}

export async function updateUser(
  id: string,
  input: Partial<{ name: string; email: string; phone: string; role: StaffRole; password: string }>
): Promise<StaffUser> {
  const { data } = await apiClient.patch<StaffUser>(`/users/${id}`, input);
  return data;
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/users/${id}`);
}
