import { apiClient } from "./client";
import type { AttendanceRecord } from "./types";

export async function clockIn(): Promise<AttendanceRecord> {
  const { data } = await apiClient.post<AttendanceRecord>("/attendance/clock-in");
  return data;
}

export async function clockOut(): Promise<AttendanceRecord> {
  const { data } = await apiClient.post<AttendanceRecord>("/attendance/clock-out");
  return data;
}

export async function listOwnAttendance(): Promise<AttendanceRecord[]> {
  const { data } = await apiClient.get<AttendanceRecord[]>("/attendance/me");
  return data;
}

/** ADMIN/MANAGER only — every staff member's records. */
export async function listAllAttendance(): Promise<AttendanceRecord[]> {
  const { data } = await apiClient.get<AttendanceRecord[]>("/attendance");
  return data;
}

export interface KioskPunchResult {
  name: string;
  action: "in" | "out";
  record: AttendanceRecord;
}

/** Shared-device kiosk: a staff member's 4-digit employee code clocks them in or out. */
export async function kioskPunch(code: string, action: "in" | "out"): Promise<KioskPunchResult> {
  const { data } = await apiClient.post<KioskPunchResult>("/attendance/kiosk/punch", { code, action });
  return data;
}

/** Leaving kiosk mode — the logged-in manager's password. */
export async function kioskVerifyExit(password: string): Promise<void> {
  await apiClient.post("/attendance/kiosk/exit", { password });
}
