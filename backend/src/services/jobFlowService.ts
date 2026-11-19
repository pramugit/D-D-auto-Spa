import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { createAndSendNotification } from "./notificationService";
import { getOrCreateLink } from "./damageInspectionService";
import { recalculateInvoiceIfExists } from "./invoiceService";

/**
 * Booked-job flow on the job card page (walk-ins have their own Daily Jobs flow):
 *   1 pick a free bay · 2 cool-down · 3–5 damage inspection + customer approval
 *   (damageInspectionService) · 6 lounge-or-leave + ready time on WhatsApp ·
 *   7 start work / inventory · 8 emergency extra work with an approval link ·
 *   9 QC → Ready (WhatsApp from bookingService) · 10 invoice · 11 payment.
 */

const shopTime = (d: Date) =>
  d.toLocaleString("en-GB", { timeZone: "Asia/Colombo", hour: "numeric", minute: "2-digit", hour12: true });
const shopDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });

async function loadJob(jobCardId: string) {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    include: {
      booking: {
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          vehicle: { select: { make: true, model: true, plateNumber: true } },
          bay: true,
        },
      },
    },
  });
  if (!jobCard) throw new AppError(404, "Job card not found");
  return jobCard;
}

const OPEN_STATUSES = ["CONFIRMED", "IN_PROGRESS", "QUALITY_CHECK"] as const;

/** Bays with whether a car is physically in them right now (checked in, job not yet Ready). */
export async function listBays() {
  const bays = await prisma.bay.findMany({ orderBy: { name: "asc" } });
  const inUse = await prisma.booking.findMany({
    where: { bayId: { not: null }, status: { in: [...OPEN_STATUSES] }, jobCard: { bayCheckedInAt: { not: null } } },
    select: { bayId: true, vehicle: { select: { plateNumber: true } }, jobCard: { select: { id: true } } },
  });
  return bays.map((b) => {
    const occupant = inUse.find((u) => u.bayId === b.id);
    return {
      ...b,
      occupiedBy: occupant ? { jobCardId: occupant.jobCard!.id, plateNumber: occupant.vehicle.plateNumber } : null,
    };
  });
}

/** Step 1 — bring the car into a free bay. */
export async function checkInBay(jobCardId: string, bayId: string) {
  const job = await loadJob(jobCardId);
  const bay = await prisma.bay.findUnique({ where: { id: bayId } });
  if (!bay) throw new AppError(404, "Bay not found");
  if (bay.status === "MAINTENANCE") throw new AppError(409, `${bay.name} is under maintenance`);
  const occupant = (await listBays()).find((b) => b.id === bayId)?.occupiedBy;
  if (occupant && occupant.jobCardId !== jobCardId) {
    throw new AppError(409, `${bay.name} is busy with ${occupant.plateNumber}`);
  }
  const previousBayId = job.bookingId && job.booking.bayId !== bayId && job.bayCheckedInAt ? job.booking.bayId : null;
  await prisma.$transaction([
    prisma.booking.update({ where: { id: job.bookingId }, data: { bayId } }),
    prisma.jobCard.update({ where: { id: jobCardId }, data: { bayCheckedInAt: job.bayCheckedInAt ?? new Date() } }),
    prisma.bay.update({ where: { id: bayId }, data: { status: "OCCUPIED" } }),
    ...(previousBayId ? [prisma.bay.update({ where: { id: previousBayId }, data: { status: "AVAILABLE" } })] : []),
  ]);
}

/** Called when a job reaches Ready/Completed/Cancelled — the car has left the bay. */
export async function releaseBay(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { bayId: true } });
  if (!booking?.bayId) return;
  await prisma.bay.updateMany({ where: { id: booking.bayId, status: "OCCUPIED" }, data: { status: "AVAILABLE" } });
}

/** Step 2 — start the cool-down timer. */
export async function startCooldown(jobCardId: string, minutes: number) {
  await loadJob(jobCardId);
  await prisma.jobCard.update({
    where: { id: jobCardId },
    data: { cooldownStartedAt: new Date(), cooldownMinutes: minutes, cooldownDoneAt: null },
  });
}

/** Step 2 — cool-down finished (or skipped). */
export async function finishCooldown(jobCardId: string) {
  await loadJob(jobCardId);
  await prisma.jobCard.update({ where: { id: jobCardId }, data: { cooldownDoneAt: new Date() } });
}

/** Step 6 — tell the customer to wait in the lounge or that they can leave, with the ready time. */
export async function sendTiming(jobCardId: string, waiting: "LOUNGE" | "LEAVE", readyAt: Date, send: boolean) {
  const job = await loadJob(jobCardId);
  if (readyAt.getTime() < Date.now() - 5 * 60_000) throw new AppError(400, "The ready time is in the past");
  const { customer, vehicle } = job.booking;
  let sent = false;
  if (send) {
    if (!customer.phone) throw new AppError(400, "This customer has no phone number — tell them in person and untick WhatsApp");
    const sameDay = shopDay(readyAt) === shopDay(new Date());
    const when = sameDay
      ? `around ${shopTime(readyAt)} today`
      : `around ${shopTime(readyAt)} on ${readyAt.toLocaleDateString("en-GB", { timeZone: "Asia/Colombo", weekday: "long", day: "numeric", month: "short" })}`;
    const car = `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})`;
    const message =
      waiting === "LOUNGE"
        ? `Hi ${customer.name}, thank you for confirming. Please relax in our customer lounge — your ${car} should be ready ${when}. We'll let you know as soon as it's done.\n\nD & D Auto Spa`
        : `Hi ${customer.name}, thank you for confirming. You're free to leave — your ${car} should be ready ${when}. We'll WhatsApp you as soon as it's ready to collect.\n\nD & D Auto Spa`;
    const n = await createAndSendNotification({ customerId: customer.id, type: "GENERAL", channel: "WHATSAPP", message });
    if (n.status === "FAILED") throw new AppError(502, "WhatsApp message failed to send — tell the customer in person");
    sent = true;
  }
  await prisma.jobCard.update({
    where: { id: jobCardId },
    data: { customerWaiting: waiting, promisedReadyAt: readyAt, ...(sent ? { timingSentAt: new Date() } : {}) },
  });
  return { sent };
}

/**
 * Step 8 — extra ("emergency") work found mid-job. Saved as a pending
 * repair offer on the job's inspection and, when asked, WhatsApped to the
 * customer with the approval link (same page as the inspection report).
 */
export async function addExtraWork(
  jobCardId: string,
  input: { damageTypeId?: string; note?: string; price: number; photoUrl?: string; severity?: "MINOR" | "MODERATE" | "SEVERE"; send: boolean },
  staffUserId: string,
) {
  const job = await loadJob(jobCardId);
  if (!input.damageTypeId && !input.note?.trim()) throw new AppError(400, "Describe the extra work (pick a type or write a note)");
  const type = input.damageTypeId ? await prisma.damageType.findUnique({ where: { id: input.damageTypeId } }) : null;
  if (input.damageTypeId && !type) throw new AppError(400, "Unknown damage type");

  let inspection = await prisma.damageInspection.findFirst({ where: { jobCardId } });
  if (!inspection) {
    inspection = await prisma.damageInspection.create({
      data: { jobCardId, stage: "PRE_SERVICE", inspectedByUserId: staffUserId },
    });
  }
  await prisma.$transaction([
    prisma.damageMarking.create({
      data: {
        damageInspectionId: inspection.id,
        view: "FRONT",
        damageTypeId: type?.id,
        note: input.note?.trim() || null,
        suggestedPrice: input.price,
        isAdditionalRepairOffer: true,
        approvalStatus: "PENDING",
        severity: input.severity ?? "MODERATE",
        photoUrl: input.photoUrl,
        foundDuringWork: true,
      },
    }),
    // A new decision is needed — the report isn't "confirmed" until they answer.
    prisma.damageInspection.update({ where: { id: inspection.id }, data: { customerAcknowledged: false } }),
  ]);

  const { url } = await getOrCreateLink(inspection.id);
  if (!input.send) return { url, sent: false };

  const { customer, vehicle } = job.booking;
  if (!customer.phone) return { url, sent: false, warning: "This customer has no phone number — copy the link and share it another way" };
  const what = [type?.name, input.note?.trim()].filter(Boolean).join(" — ");
  const message =
    `Hi ${customer.name}, while working on your ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber}) we found something that needs attention:\n` +
    `• ${what} — Rs. ${input.price.toLocaleString("en-LK", { minimumFractionDigits: 2 })}\n\n` +
    `Please look at the photo and approve or decline here: ${url}\n\nD & D Auto Spa`;
  const n = await createAndSendNotification({ customerId: customer.id, type: "INSPECTION_REPORT", channel: "WHATSAPP", message });
  if (n.status === "FAILED") return { url, sent: false, warning: "WhatsApp message failed to send — copy the link and share it another way" };
  await prisma.damageInspection.update({ where: { id: inspection.id }, data: { sentToCustomerAt: new Date() } });
  return { url, sent: true };
}

/** Step 8 — withdraw an extra-work request the customer hasn't answered yet. */
export async function removeExtraWork(jobCardId: string, markingId: string) {
  const marking = await prisma.damageMarking.findUnique({ where: { id: markingId }, include: { damageInspection: true } });
  if (!marking || marking.damageInspection.jobCardId !== jobCardId || !marking.foundDuringWork) {
    throw new AppError(404, "Extra work not found");
  }
  if (marking.approvalStatus !== "PENDING") throw new AppError(409, "The customer already answered — it can't be removed");
  await prisma.damageMarking.delete({ where: { id: markingId } });
  // If nothing else is waiting on the customer, the report is back to its confirmed state.
  const stillPending = await prisma.damageMarking.count({
    where: { damageInspectionId: marking.damageInspectionId, isAdditionalRepairOffer: true, approvalStatus: "PENDING" },
  });
  if (stillPending === 0 && marking.damageInspection.acknowledgedAt) {
    await prisma.damageInspection.update({ where: { id: marking.damageInspectionId }, data: { customerAcknowledged: true } });
  }
  await recalculateInvoiceIfExists(jobCardId);
}
