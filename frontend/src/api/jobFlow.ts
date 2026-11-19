import { apiClient } from "./client";
import type { Bay, DamageSeverity } from "./types";

// Booked-job flow on the job card page — see backend's services/jobFlowService.ts.

export interface FlowBay extends Bay {
  /** A car is physically in this bay right now. */
  occupiedBy: { jobCardId: string; plateNumber: string } | null;
}

export async function listBays(): Promise<FlowBay[]> {
  const { data } = await apiClient.get<FlowBay[]>("/job-cards/flow/bays");
  return data;
}

export async function checkInBay(jobCardId: string, bayId: string): Promise<void> {
  await apiClient.post(`/job-cards/${jobCardId}/flow/bay`, { bayId });
}

export async function startCooldown(jobCardId: string, minutes: number): Promise<void> {
  await apiClient.post(`/job-cards/${jobCardId}/flow/cooldown`, { minutes });
}

export async function finishCooldown(jobCardId: string): Promise<void> {
  await apiClient.post(`/job-cards/${jobCardId}/flow/cooldown/done`);
}

export async function sendTiming(
  jobCardId: string,
  waiting: "LOUNGE" | "LEAVE",
  readyAt: Date,
  send: boolean,
): Promise<{ sent: boolean }> {
  const { data } = await apiClient.post<{ sent: boolean }>(`/job-cards/${jobCardId}/flow/timing`, {
    waiting,
    readyAt: readyAt.toISOString(),
    send,
  });
  return data;
}

export interface ExtraWorkInput {
  damageTypeId?: string;
  note?: string;
  price: number;
  photoUrl?: string;
  severity?: DamageSeverity;
  send: boolean;
}

export async function addExtraWork(
  jobCardId: string,
  input: ExtraWorkInput,
): Promise<{ url: string; sent: boolean; warning?: string }> {
  const { data } = await apiClient.post<{ url: string; sent: boolean; warning?: string }>(
    `/job-cards/${jobCardId}/flow/extra-work`,
    input,
  );
  return data;
}

export async function removeExtraWork(jobCardId: string, markingId: string): Promise<void> {
  await apiClient.delete(`/job-cards/${jobCardId}/flow/extra-work/${markingId}`);
}
