import { apiClient } from "./client";
import type { DamageInspection, DamageMarking, DamageSeverity, InspectionStage, JobCard, Photo, PhotoType, ProfitBreakdown } from "./types";

export async function listJobCards(
  status?: string,
  walkIn?: boolean,
  range?: { from: Date; to: Date }
): Promise<JobCard[]> {
  const params: Record<string, string> = {};
  if (status) params.status = status;
  if (walkIn !== undefined) params.walkIn = String(walkIn);
  if (range) {
    params.from = range.from.toISOString();
    params.to = range.to.toISOString();
  }
  const { data } = await apiClient.get<JobCard[]>("/job-cards", { params: Object.keys(params).length ? params : undefined });
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

export interface NewMarkingInput {
  /** Existing marker being edited (absent = new). */
  id?: string;
  x: number;
  y: number;
  z: number;
  damageTypeId?: string;
  note?: string;
  suggestedPrice?: number;
  isAdditionalRepairOffer?: boolean;
  severity?: DamageSeverity;
  photoUrl?: string;
}

export async function createDamageInspection(
  jobCardId: string,
  stage: InspectionStage,
  markings: NewMarkingInput[]
): Promise<DamageInspection> {
  // The per-marking "view" (front/rear/left/right) is vestigial since the
  // move off the 4-view diagram set — the column is still NOT NULL on the
  // backend, so every marking is sent with a fixed placeholder value.
  const { data } = await apiClient.post<DamageInspection>(`/job-cards/${jobCardId}/damage-inspection`, {
    stage,
    markings: markings.map((m) => ({ ...m, view: "FRONT" as const })),
  });
  return data;
}

export async function acknowledgeDamageInspection(inspectionId: string): Promise<DamageInspection> {
  const { data } = await apiClient.patch<DamageInspection>(`/damage-inspections/${inspectionId}/acknowledge`);
  return data;
}

/** Staff-only correction path — resets a decided offer back to PENDING
 *  so the customer can be asked again (a customer can never do this
 *  themselves once they've decided). */
export async function resetDamageMarking(markingId: string): Promise<DamageMarking> {
  const { data } = await apiClient.patch<DamageMarking>(`/damage-markings/${markingId}/reset`);
  return data;
}

/** Uploads a close-up photo for one damage marking and returns its URL —
 *  the marking itself doesn't exist server-side yet at this point (see
 *  createDamageInspection above), so this is a standalone upload, not
 *  scoped to a job card or marking id. */
export async function uploadDamagePhoto(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("photo", file);
  const { data } = await apiClient.post<{ url: string }>("/job-cards/upload-damage-photo", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function uploadPhoto(jobCardId: string, file: File, type: PhotoType): Promise<Photo> {
  const form = new FormData();
  form.append("type", type);
  form.append("photo", file);
  const { data } = await apiClient.post<Photo>(`/job-cards/${jobCardId}/photos`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function sendPhotoWhatsApp(jobCardId: string, photoId: string) {
  const { data } = await apiClient.post(`/job-cards/${jobCardId}/photos/${photoId}/send-whatsapp`);
  return data;
}

export async function sendImagesWhatsApp(jobCardId: string) {
  const { data } = await apiClient.post(`/job-cards/${jobCardId}/send-images-whatsapp`);
  return data;
}

export async function recordInventoryUsage(jobCardId: string, itemId: string, quantityUsed: number) {
  const { data } = await apiClient.post(`/job-cards/${jobCardId}/inventory-usage`, { itemId, quantityUsed });
  return data;
}

/** For a part bought specifically for this job because the requested
 *  quantity exceeded on-hand stock — billed to the customer at cost
 *  (see invoiceService). */
export async function recordExternalInventoryUsage(
  jobCardId: string,
  externalName: string,
  externalCost: number,
  quantityUsed: number,
  externalVendorNote?: string
) {
  const { data } = await apiClient.post(`/job-cards/${jobCardId}/inventory-usage`, {
    sourceType: "EXTERNAL_PURCHASE",
    externalName,
    externalCost,
    externalVendorNote,
    quantityUsed,
  });
  return data;
}

/** Removes a usage line from a job — stock items go back into stock. */
export async function removeInventoryUsage(jobCardId: string, usageId: string) {
  const { data } = await apiClient.delete(`/job-cards/${jobCardId}/inventory-usage/${usageId}`);
  return data;
}

export async function getJobCardProfit(jobCardId: string): Promise<ProfitBreakdown> {
  const { data } = await apiClient.get<ProfitBreakdown>(`/job-cards/${jobCardId}/profit`);
  return data;
}
