import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { createAndSendNotification } from "./notificationService";
import { recordDamageMarkingDecisionJobNotification } from "./jobNotificationService";
import { recalculateInvoiceIfExists } from "./invoiceService";

/**
 * The practical damage-inspection flow:
 *   1. Staff inspect the vehicle — markers + close-up photos (jobCardController.createDamageInspection).
 *   2. Staff send the report to the customer — a WhatsApp message with a
 *      no-login link (/inspection/<token>), or open that link on the shop
 *      device for a customer standing at the counter.
 *   3. The customer reviews each damage with its photo, approves/declines
 *      any paid repair offers and confirms the report. Only then can a
 *      scheduled booking move to IN_PROGRESS (see assertReadyToStart).
 */

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5180").replace(/\/$/, "");

export const approvalUrl = (token: string) => `${FRONTEND_URL}/inspection/${token}`;

const inspectionInclude = {
  markings: { include: { damageType: true }, orderBy: { createdAt: "asc" } },
  jobCard: {
    include: {
      booking: {
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          vehicle: { select: { make: true, model: true, plateNumber: true, vehicleType: true, color: true } },
        },
      },
    },
  },
} satisfies Prisma.DamageInspectionInclude;

type FullInspection = Prisma.DamageInspectionGetPayload<{ include: typeof inspectionInclude }>;

/** Returns the inspection's approval link, creating its token on first use. */
export async function getOrCreateLink(inspectionId: string) {
  const inspection = await prisma.damageInspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) throw new AppError(404, "Damage inspection not found");
  let token = inspection.approvalToken;
  if (!token) {
    token = crypto.randomBytes(24).toString("base64url");
    await prisma.damageInspection.update({ where: { id: inspectionId }, data: { approvalToken: token } });
  }
  return { token, url: approvalUrl(token) };
}

/** Step 2 — WhatsApp the approval link to the booking's customer. */
export async function sendToCustomer(inspectionId: string) {
  const { url } = await getOrCreateLink(inspectionId);
  const inspection = await prisma.damageInspection.findUniqueOrThrow({
    where: { id: inspectionId },
    include: inspectionInclude,
  });
  const { customer, vehicle } = inspection.jobCard.booking;
  if (!customer.phone) throw new AppError(400, "This customer has no phone number — copy the link and share it another way");

  const damageCount = inspection.markings.length;
  const offers = inspection.markings.filter((m) => m.isAdditionalRepairOffer);
  const stageWord = inspection.stage === "PRE_SERVICE" ? "before starting work" : "after finishing the work";
  const lines = [
    `Hi ${customer.name}, we inspected your ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber}) ${stageWord}.`,
    damageCount === 0
      ? "No damage was found."
      : `We found ${damageCount} existing damage point${damageCount === 1 ? "" : "s"} — please check the photos.`,
  ];
  if (offers.length > 0) {
    lines.push(`${offers.length} optional repair${offers.length === 1 ? " needs" : "s need"} your approval.`);
  }
  lines.push("", `Review and confirm here: ${url}`, "", "D & D Auto Spa");

  const notification = await createAndSendNotification({
    customerId: customer.id,
    type: "INSPECTION_REPORT",
    channel: "WHATSAPP",
    message: lines.join("\n"),
  });
  if (notification.status === "FAILED") {
    throw new AppError(502, "WhatsApp message failed to send — copy the link and share it another way");
  }
  await prisma.damageInspection.update({ where: { id: inspectionId }, data: { sentToCustomerAt: new Date() } });
  return { url, sentAt: new Date().toISOString() };
}

/** What the public approval page may see — no customer phone/email, no internal ids beyond markings. */
function toPublicView(i: FullInspection) {
  const { booking } = i.jobCard;
  return {
    stage: i.stage,
    inspectedAt: i.createdAt,
    customerFirstName: booking.customer.name.split(" ")[0],
    vehicle: booking.vehicle,
    confirmed: i.customerAcknowledged,
    confirmedAt: i.acknowledgedAt,
    customerComment: i.customerComment,
    markings: i.markings.map((m) => ({
      id: m.id,
      x: m.x,
      y: m.y,
      z: m.z,
      view: m.view,
      damageType: m.damageType ? { id: m.damageType.id, name: m.damageType.name } : null,
      note: m.note,
      severity: m.severity,
      photoUrl: m.photoUrl,
      isAdditionalRepairOffer: m.isAdditionalRepairOffer,
      suggestedPrice: m.suggestedPrice,
      approvalStatus: m.approvalStatus,
      decidedAt: m.decidedAt,
      createdAt: m.createdAt,
    })),
  };
}

async function findByToken(token: string) {
  const inspection = await prisma.damageInspection.findUnique({ where: { approvalToken: token }, include: inspectionInclude });
  if (!inspection) throw new AppError(404, "This inspection link is not valid");
  return inspection;
}

export async function getPublic(token: string) {
  return toPublicView(await findByToken(token));
}

export interface Decision {
  markingId: string;
  approved: boolean;
}

/**
 * Step 3 — record the customer's answer: a decision for every still-PENDING
 * repair offer, plus confirmation of the report as a whole. Shared by the
 * public link (via = CUSTOMER_LINK) and the front desk recording it for a
 * customer in person (via = STAFF_IN_PERSON).
 */
async function respond(inspection: FullInspection, decisions: Decision[], comment: string | undefined, via: string) {
  const pending = inspection.markings.filter((m) => m.isAdditionalRepairOffer && m.approvalStatus === "PENDING");
  if (inspection.customerAcknowledged && pending.length === 0) {
    throw new AppError(409, "This inspection has already been confirmed");
  }
  const byId = new Map(decisions.map((d) => [d.markingId, d.approved]));
  const missing = pending.filter((m) => !byId.has(m.id));
  if (missing.length > 0) throw new AppError(400, "Please approve or decline every repair before confirming");
  const pendingIds = new Set(pending.map((m) => m.id));
  if (decisions.some((d) => !pendingIds.has(d.markingId))) {
    throw new AppError(400, "A decision was sent for a repair that isn't waiting for one");
  }

  const now = new Date();
  await prisma.$transaction([
    ...pending.map((m) =>
      prisma.damageMarking.update({
        where: { id: m.id },
        data: { approvalStatus: byId.get(m.id) ? "APPROVED" : "DECLINED", decidedAt: now },
      }),
    ),
    prisma.damageInspection.update({
      where: { id: inspection.id },
      data: {
        customerAcknowledged: true,
        acknowledgedAt: inspection.acknowledgedAt ?? now,
        acknowledgedVia: inspection.acknowledgedVia ?? via,
        customerComment: comment?.trim() ? comment.trim() : inspection.customerComment,
      },
    }),
  ]);

  const jobCard = { ...inspection.jobCard, booking: inspection.jobCard.booking };
  for (const m of pending) {
    await recordDamageMarkingDecisionJobNotification(jobCard, !!byId.get(m.id), m.damageType?.name ?? m.note ?? "damage repair");
  }
  const { customer, vehicle } = inspection.jobCard.booking;
  const approvedCount = pending.filter((m) => byId.get(m.id)).length;
  await prisma.jobNotification.create({
    data: {
      jobCardId: inspection.jobCardId,
      type: "INSPECTION_CONFIRMED",
      statusAtEvent: inspection.jobCard.status,
      message:
        `${customer.name} confirmed the ${inspection.stage === "PRE_SERVICE" ? "pre-service" : "post-service"} damage report for ${vehicle.plateNumber}` +
        (pending.length > 0 ? ` (${approvedCount} of ${pending.length} repair${pending.length === 1 ? "" : "s"} approved)` : "") +
        (via === "STAFF_IN_PERSON" ? " in person." : ".") +
        (comment?.trim() ? ` Comment: "${comment.trim()}"` : ""),
    },
  });
  if (pending.length > 0) await recalculateInvoiceIfExists(inspection.jobCardId);
}

export async function respondPublic(token: string, decisions: Decision[], comment?: string) {
  const inspection = await findByToken(token);
  await respond(inspection, decisions, comment, "CUSTOMER_LINK");
  return getPublic(token);
}

export async function confirmInPerson(inspectionId: string, decisions: Decision[], comment?: string) {
  const inspection = await prisma.damageInspection.findUnique({ where: { id: inspectionId }, include: inspectionInclude });
  if (!inspection) throw new AppError(404, "Damage inspection not found");
  await respond(inspection, decisions, comment, "STAFF_IN_PERSON");
}

/**
 * Gate for CONFIRMED -> IN_PROGRESS on a scheduled booking: the
 * pre-service inspection must exist and, when it found damage, the
 * customer must have confirmed it with no repair offer left undecided.
 */
export async function assertReadyToStart(jobCardId: string) {
  const pre = await prisma.damageInspection.findFirst({
    where: { jobCardId, stage: "PRE_SERVICE" },
    include: { markings: { select: { isAdditionalRepairOffer: true, approvalStatus: true } } },
  });
  if (!pre) {
    throw new AppError(400, "Do the pre-service damage inspection first (or mark it “No damage”) before starting work");
  }
  if (pre.markings.length === 0) return;
  if (pre.markings.some((m) => m.isAdditionalRepairOffer && m.approvalStatus === "PENDING")) {
    throw new AppError(400, "Waiting for the customer to approve or decline the repairs in the damage inspection");
  }
  if (!pre.customerAcknowledged) {
    throw new AppError(400, "Waiting for the customer to confirm the damage inspection — send it to them or record it in person");
  }
}
