import type { BookingStatus } from "../api/types";

/**
 * The single status pipeline every job card moves through, shared by the
 * Job Board/Daily Jobs Kanban AND the job card hub page — one source of
 * truth so both surfaces always agree on what "next" means and never
 * drift out of sync with each other.
 */
export interface JobStatusStep {
  status: BookingStatus;
  label: string;
  next?: BookingStatus;
  nextLabel?: string;
}

export const JOB_STATUS_FLOW: JobStatusStep[] = [
  { status: "CONFIRMED", label: "Waiting", next: "IN_PROGRESS", nextLabel: "Start Job" },
  { status: "IN_PROGRESS", label: "In Progress", next: "QUALITY_CHECK", nextLabel: "Send to QC" },
  { status: "QUALITY_CHECK", label: "Quality Check", next: "READY", nextLabel: "Mark Ready" },
  { status: "READY", label: "Ready", next: "COMPLETED", nextLabel: "Complete" },
  { status: "COMPLETED", label: "Completed" },
];

// Columns/stages with a "Send Images" WhatsApp button — the customer
// expects to see work photos at each of these stages. Matches
// PHOTO_STATUSES in the backend's jobNotificationService.ts (the
// 15-minute overdue warning).
export const PHOTO_STATUSES: BookingStatus[] = ["IN_PROGRESS", "QUALITY_CHECK", "READY", "COMPLETED"];
