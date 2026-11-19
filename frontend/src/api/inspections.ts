import { apiClient } from "./client";
import type { DamageApprovalStatus, DamageSeverity, InspectionStage, VehicleType } from "./types";

// Steps 2 & 3 of the damage-inspection flow — see backend's
// services/damageInspectionService.ts.

export interface InspectionDecision {
  markingId: string;
  approved: boolean;
}

/** The customer-facing approval link (created on first call). */
export async function getApprovalLink(inspectionId: string): Promise<{ token: string; url: string }> {
  const { data } = await apiClient.post<{ token: string; url: string }>(`/damage-inspections/${inspectionId}/link`);
  return data;
}

/** WhatsApps the approval link to the booking's customer. */
export async function sendToCustomer(inspectionId: string): Promise<{ url: string; sentAt: string }> {
  const { data } = await apiClient.post<{ url: string; sentAt: string }>(`/damage-inspections/${inspectionId}/send`);
  return data;
}

/** Front desk records the decisions of a customer standing at the counter. */
export async function confirmInPerson(inspectionId: string, decisions: InspectionDecision[], comment?: string): Promise<void> {
  await apiClient.post(`/damage-inspections/${inspectionId}/confirm-in-person`, { decisions, comment });
}

// ---- Public, no login ----

export interface PublicInspectionMarking {
  id: string;
  x: number | null;
  y: number | null;
  z: number | null;
  view: string;
  damageType: { id: string; name: string } | null;
  note: string | null;
  severity: DamageSeverity;
  photoUrl: string | null;
  isAdditionalRepairOffer: boolean;
  suggestedPrice: string | null;
  approvalStatus: DamageApprovalStatus;
  decidedAt: string | null;
  createdAt: string;
}

export interface PublicInspection {
  stage: InspectionStage;
  inspectedAt: string;
  customerFirstName: string;
  vehicle: { make: string; model: string; plateNumber: string; vehicleType: VehicleType; color: string | null };
  confirmed: boolean;
  confirmedAt: string | null;
  customerComment: string | null;
  markings: PublicInspectionMarking[];
}

export async function getPublicInspection(token: string): Promise<PublicInspection> {
  const { data } = await apiClient.get<PublicInspection>(`/public/inspections/${token}`);
  return data;
}

export async function respondToInspection(token: string, decisions: InspectionDecision[], comment?: string): Promise<PublicInspection> {
  const { data } = await apiClient.post<PublicInspection>(`/public/inspections/${token}/respond`, { decisions, comment });
  return data;
}
