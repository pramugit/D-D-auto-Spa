import { prisma } from "../utils/prisma";
import type { BookingStatus } from "@prisma/client";
import { getStatusEnteredAt } from "./bookingService";

// The four statuses where the customer expects to see work photos, per
// the Job Board's "Send Images" buttons — matches PHOTO_STATUSES on the
// frontend column config.
const PHOTO_STATUSES: BookingStatus[] = ["IN_PROGRESS", "QUALITY_CHECK", "READY", "COMPLETED"];
const OVERDUE_MINUTES = 15;

const STATUS_LABELS: Partial<Record<BookingStatus, string>> = {
  IN_PROGRESS: "In Progress",
  QUALITY_CHECK: "Quality Check",
  READY: "Ready",
  COMPLETED: "Completed",
};

/**
 * Logged every time a technician (or any staff member) uploads a BEFORE/AFTER
 * photo onto a job card — distinct from recordPhotosSentJobNotification
 * below, which fires only once that photo is actually shared with the
 * customer over WhatsApp. Does NOT suppress the overdue warning: an
 * uploaded-but-unsent photo still needs to go out to the customer.
 */
export async function recordPhotoUploadedJobNotification(
  jobCard: { id: string; status: BookingStatus; booking: { vehicle: { plateNumber: string }; customer: { name: string } } },
  technicianId: string | null,
  photoType: "BEFORE" | "AFTER" | "PROGRESS"
) {
  const message = `A ${photoType.toLowerCase()} photo was uploaded for ${jobCard.booking.vehicle.plateNumber} (${jobCard.booking.customer.name}). Not yet sent to the customer.`;

  return prisma.jobNotification.create({
    data: {
      jobCardId: jobCard.id,
      type: "PHOTOS_UPLOADED",
      message,
      statusAtEvent: jobCard.status,
      technicianId,
    },
  });
}

/**
 * Logged every time a technician (or any staff member) sends job photos to
 * the customer over WhatsApp — from either the Job Board's bulk "Send
 * Images" button or the Job Card detail page's per-photo "Send WhatsApp"
 * button. This is what suppresses the 15-minute overdue warning below.
 */
export async function recordPhotosSentJobNotification(
  jobCard: { id: string; status: BookingStatus; booking: { vehicle: { plateNumber: string }; customer: { name: string } } },
  technicianId: string | null
) {
  const statusLabel = STATUS_LABELS[jobCard.status] ?? jobCard.status;
  const message = `Work photos sent to ${jobCard.booking.customer.name} for ${jobCard.booking.vehicle.plateNumber} (${statusLabel}).`;

  return prisma.jobNotification.create({
    data: {
      jobCardId: jobCard.id,
      type: "PHOTOS_SENT",
      message,
      statusAtEvent: jobCard.status,
      technicianId,
    },
  });
}

/**
 * Logged whenever a customer approves or declines an additional-repair
 * offer (see damageMarkingController.decide) — staff need to know a
 * decision landed so the job card isn't left waiting silently on it.
 */
export async function recordDamageMarkingDecisionJobNotification(
  jobCard: { id: string; status: BookingStatus; booking: { vehicle: { plateNumber: string }; customer: { name: string } } },
  approved: boolean,
  markingLabel: string
) {
  const message = `${jobCard.booking.customer.name} ${approved ? "approved" : "declined"} the "${markingLabel}" repair for ${jobCard.booking.vehicle.plateNumber}.`;

  return prisma.jobNotification.create({
    data: {
      jobCardId: jobCard.id,
      type: "DAMAGE_MARKING_DECIDED",
      message,
      statusAtEvent: jobCard.status,
    },
  });
}

/**
 * Read-only-ish computed check, same pattern as bookingService's
 * getBookingsNeedingAttention — no background job/cron in this codebase,
 * so this runs lazily whenever the Job Board or Job Notifications page is
 * loaded. For every job card sitting in a photo-relevant status for more
 * than OVERDUE_MINUTES with nobody having sent images for THIS stage yet
 * (no PHOTOS_SENT row since it entered the status), it raises exactly one
 * PHOTOS_OVERDUE warning — re-entering the same status later (e.g.
 * QUALITY_CHECK -> READY -> back is impossible, but each distinct stage)
 * can raise its own warning again.
 */
export async function checkOverduePhotoNotifications(): Promise<void> {
  const jobCards = await prisma.jobCard.findMany({
    where: { status: { in: PHOTO_STATUSES } },
    include: {
      booking: { select: { id: true, vehicle: { select: { plateNumber: true } }, customer: { select: { name: true } } } },
      technicians: { select: { userId: true } },
    },
  });

  const now = Date.now();

  for (const jobCard of jobCards) {
    const enteredAt = await getStatusEnteredAt(jobCard.booking.id);
    const minutesInStatus = Math.round((now - enteredAt.getTime()) / 60000);
    if (minutesInStatus < OVERDUE_MINUTES) continue;

    const alreadyHandled = await prisma.jobNotification.findFirst({
      where: {
        jobCardId: jobCard.id,
        createdAt: { gte: enteredAt },
        type: { in: ["PHOTOS_SENT", "PHOTOS_OVERDUE"] },
      },
    });
    if (alreadyHandled) continue;

    const statusLabel = STATUS_LABELS[jobCard.status] ?? jobCard.status;
    const message = `No images have been sent to ${jobCard.booking.customer.name} for ${jobCard.booking.vehicle.plateNumber} — it's been ${minutesInStatus} min in ${statusLabel}. Please send photos over WhatsApp.`;

    await prisma.jobNotification.create({
      data: {
        jobCardId: jobCard.id,
        type: "PHOTOS_OVERDUE",
        message,
        statusAtEvent: jobCard.status,
        technicianId: jobCard.technicians[0]?.userId ?? null,
      },
    });
  }
}

export async function listJobNotifications() {
  return prisma.jobNotification.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      technician: { select: { id: true, name: true } },
      jobCard: {
        select: {
          id: true,
          status: true,
          booking: {
            select: {
              id: true,
              vehicle: { select: { plateNumber: true, make: true, model: true } },
              customer: { select: { name: true } },
            },
          },
        },
      },
    },
  });
}
