import { apiClient } from "./client";
import type { DamageInspection, DamageMarking, InspectionStage, JobCard, PhotoType, ProfitBreakdown } from "./types";

export async function listJobCards(status?: string): Promise<JobCard[]> {
  const { data } = await apiClient.get<JobCard[]>("/job-cards", { params: status ? { status } : undefined });
  return data;
}

export async function getJobCard(id: string): Promise<JobCard> {
  const { data } = await apiClient.get<JobCard>(`/job-cards/${id}`);
  return data;
}

export async function assignTechnicians(id: string, technicianIds: string[]): Promise<JobCard> {
  const { data } = await apiClient.patch<JobCard>(`/job-cards/${id}/assign-technician`, { technicianIds });
  return data;
}

export async function updateJobCardNotes(id: string, notes: string): Promise<JobCard> {
  const { data } = await apiClient.patch<JobCard>(`/job-cards/${id}/notes`, { notes });
  return data;
}

export async function createDamageInspection(
  jobCardId: string,
  stage: InspectionStage,
  diagramMarkings: DamageMarking[]
): Promise<DamageInspection> {
  const { data } = await apiClient.post<DamageInspection>(`/job-cards/${jobCardId}/damage-inspection`, {
    stage,
    diagramMarkings,
  });
  return data;
}

export async function acknowledgeDamageInspection(inspectionId: string): Promise<DamageInspection> {
  const { data } = await apiClient.patch<DamageInspection>(`/damage-inspections/${inspectionId}/acknowledge`);
  return data;
}

export async function uploadPhoto(jobCardId: string, file: File, type: PhotoType) {
  const form = new FormData();
  form.append("type", type);
  form.append("photo", file);
  const { data } = await apiClient.post(`/job-cards/${jobCardId}/photos`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function recordInventoryUsage(jobCardId: string, itemId: string, quantityUsed: number) {
  const { data } = await apiClient.post(`/job-cards/${jobCardId}/inventory-usage`, { itemId, quantityUsed });
  return data;
}

export async function getJobCardProfit(jobCardId: string): Promise<ProfitBreakdown> {
  const { data } = await apiClient.get<ProfitBreakdown>(`/job-cards/${jobCardId}/profit`);
  return data;
}
