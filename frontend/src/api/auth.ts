import { apiClient } from "./client";
import type { StaffRole, StaffUser } from "./types";

export interface LoginResponse {
  token: string;
  user: StaffUser;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>("/auth/login", { email, password });
  return data;
}

export async function registerStaff(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role?: StaffRole;
}): Promise<{ user: StaffUser }> {
  const { data } = await apiClient.post("/auth/register", input);
  return data;
}
