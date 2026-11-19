import type { Request, Response } from "express";
import type { Booking, Prisma } from "@prisma/client";
import { recalculateInvoiceIfExists } from "../services/invoiceService";
import { prisma } from "../utils/prisma";
import * as jobFlow from "../services/jobFlowService";
import { AppError } from "../utils/AppError";
import { safeCustomerSelect, safeStaffSelect } from "../utils/prismaSelects";
import { calculateJobCardProfit } from "../services/profitService";
import { getCurrentOwnerRole } from "../services/bookingService";
import { ITEMS_SELECT, REPAIRS_SELECT, bookingMinutes, itemsMinutes, repairMinutes } from "../services/durationService";
import { sendJobPhotoWhatsApp, sendLatestJobPhotoWhatsApp, sendTechnicianAssignedWhatsApp } from "../services/notificationService";
import {
  checkOverduePhotoNotifications,
  recordPhotosSentJobNotification,
  recordPhotoUploadedJobNotification,
} from "../services/jobNotificationService";

const jobCardInclude = {
  booking: {
    include: {
      customer: { select: safeCustomerSelect },
      vehicle: true,
      currentOwner: { select: safeStaffSelect },
      services: { include: { service: true, package: true } },
      bay: true,
      // Latest status change — the Job Board's "time in this stage".
      activityLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { toStatus: true, createdAt: true } },
    },
  },
  technicians: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
  damageInspections: {
    include: { markings: { include: { damageType: true } }, inspectedByUser: { select: safeStaffSelect } },
  },
  photos: true,
  invoice: true,
  review: true,
  inventoryUsages: { include: { item: true } },
} as const;

/** Adds the computed currentOwnerRole onto the nested booking, same as bookingController does. */
function withOwnerRole<T extends { booking: { status: Booking["status"] } }>(jobCard: T) {
  return { ...jobCard, booking: { ...jobCard.booking, currentOwnerRole: getCurrentOwnerRole(jobCard.booking.status) } };
}

export async function list(req: Request, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where: Record<string, unknown> = status ? { status } : {};

  // The Job Board and Daily Jobs board are the same Kanban, filtered by
  // which pipeline the underlying booking came from — a scheduled
  // appointment (walkIn=false, the Job Board's default) or a same-day
  // walk-in (walkIn=true, the Daily Jobs board). Omit the param to get
  // both (used by callers that don't care, e.g. profit/reporting).
  const bookingWhere: Record<string, unknown> = {};
  if (req.query.walkIn === "true") {
    bookingWhere.isWalkIn = true;
  } else if (req.query.walkIn === "false") {
    bookingWhere.isWalkIn = false;
  }

  // Optional day window (Daily Jobs shows one day at a time). The client
  // sends its own local midnight-to-midnight as ISO timestamps, so the
  // "day" matches the shop's clock rather than the server's timezone.
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
  if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
    throw new AppError(400, "from/to must be valid ISO dates");
  }
  if (from || to) {
    bookingWhere.scheduledAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
  }
  if (Object.keys(bookingWhere).length > 0) where.booking = bookingWhere;

  // TECHNICIAN sees their own queue only, never the whole shop's — job
  // cards only ever exist from CONFIRMED onward (created on that
  // transition), so PENDING bookings are structurally excluded here too.
  if (req.user?.type === "staff" && req.user.role === "TECHNICIAN") {
    where.technicians = { some: { userId: req.user.sub } };
  }

  const jobCards = await prisma.jobCard.findMany({ where, include: jobCardInclude });

  // Best-effort — a failed overdue scan should never break the Job Board
  // itself. Run here (in addition to the Job Notifications page) since
  // staff/technicians load the Job Board far more often.
  checkOverduePhotoNotifications().catch((err) => console.error("[job-notifications] overdue scan failed:", err));

  res.json(jobCards.map(withOwnerRole));
}

export async function get(req: Request, res: Response) {
  const jobCard = await prisma.jobCard.findUnique({ where: { id: req.params.id }, include: jobCardInclude });
  if (!jobCard) throw new AppError(404, "Job card not found");

  if (req.user?.type === "staff" && req.user.role === "TECHNICIAN") {
    const isAssigned = jobCard.technicians.some((t) => t.userId === req.user!.sub);
    if (!isAssigned) throw new AppError(403, "Not assigned to this job card");
  }

  const timing = await prisma.booking.findUnique({
    where: { id: jobCard.bookingId },
    select: { scheduledAt: true, services: { select: ITEMS_SELECT }, jobCard: { select: REPAIRS_SELECT } },
  });
  const estimate = timing
    ? {
        totalMinutes: bookingMinutes(timing),
        serviceMinutes: itemsMinutes(timing.services),
        repairMinutes: repairMinutes(timing.jobCard),
        startsAt: (jobCard.startedAt ?? timing.scheduledAt).toISOString(),
        finishBy: new Date((jobCard.startedAt ?? timing.scheduledAt).getTime() + bookingMinutes(timing) * 60000).toISOString(),
      }
    : null;
  res.json({ ...withOwnerRole(jobCard), estimate });
}

export async function assignTechnicians(req: Request, res: Response) {
  const { technicianIds } = req.body as { technicianIds: string[] };

  const technicians = await prisma.user.findMany({
    where: { id: { in: technicianIds }, role: "TECHNICIAN", active: true },
  });
  if (technicians.length !== technicianIds.length) {
    throw new AppError(400, "One or more technicianIds are invalid or not TECHNICIAN role");
  }

  await prisma.$transaction([
    prisma.jobCardTechnician.deleteMany({ where: { jobCardId: req.params.id } }),
    prisma.jobCardTechnician.createMany({
      data: technicianIds.map((userId) => ({ jobCardId: req.params.id, userId })),
    }),
  ]);

  const jobCard = await prisma.jobCard.findUnique({ where: { id: req.params.id }, include: jobCardInclude });
  if (jobCard) {
    const names = jobCard.technicians.map((t) => t.user.name);
    await sendTechnicianAssignedWhatsApp(jobCard.booking, names);
  }
  res.json(jobCard ? withOwnerRole(jobCard) : jobCard);
}

export async function updateNotes(req: Request, res: Response) {
  const jobCard = await prisma.jobCard.update({
    where: { id: req.params.id },
    data: { notes: req.body.notes },
  });
  res.json(jobCard);
}

interface MarkingInput {
  /** Set when editing a marker that's already saved. */
  id?: string;
  view: "FRONT" | "REAR" | "LEFT_SIDE" | "RIGHT_SIDE";
  x: number;
  y: number;
  z: number;
  damageTypeId?: string;
  note?: string;
  suggestedPrice?: number;
  isAdditionalRepairOffer?: boolean;
  severity?: "MINOR" | "MODERATE" | "SEVERE";
  photoUrl?: string;
}

export async function createDamageInspection(req: Request, res: Response) {
  const markings = req.body.markings as MarkingInput[];

  // The view enum and x/y bounds are already zod-validated (see
  // createDamageInspectionSchema); a bad damageTypeId isn't catchable by
  // zod (it's a DB reference, not a shape check) and would otherwise hit
  // Prisma's raw foreign-key error — check it explicitly so the client
  // gets a clear 400 instead of a generic 500.
  const referencedIds = [...new Set(markings.map((m) => m.damageTypeId).filter((id): id is string => !!id))];
  if (referencedIds.length > 0) {
    const found = await prisma.damageType.findMany({ where: { id: { in: referencedIds } }, select: { id: true } });
    const foundIds = new Set(found.map((d) => d.id));
    const missing = referencedIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new AppError(400, `Unknown damageTypeId: ${missing.join(", ")}`);
    }
  }

  // approvalStatus is always set server-side, regardless of what the
  // client sent — an additional-repair offer starts PENDING (the customer
  // hasn't decided yet); plain documentation stays NOT_APPLICABLE and
  // never becomes billable or needs a decision.
  const fields = (m: MarkingInput) => ({
    view: m.view,
    x: m.x,
    y: m.y,
    z: m.z,
    damageTypeId: m.damageTypeId ?? null,
    note: m.note ?? null,
    suggestedPrice: m.isAdditionalRepairOffer ? m.suggestedPrice ?? 0 : null,
    isAdditionalRepairOffer: !!m.isAdditionalRepairOffer,
    severity: m.severity ?? "MINOR",
    photoUrl: m.photoUrl ?? null,
  });

  // A job card has ONE damage inspection (stored as PRE_SERVICE). Saving
  // again edits it in place: markers sent with an id are updated, new ones
  // created, missing ones deleted.
  const jobCardId = req.params.id;
  const existing = await prisma.damageInspection.findFirst({
    where: { jobCardId, stage: "PRE_SERVICE" },
    // Extra work found mid-job (step 8) is managed on its own, never by the inspection editor.
    include: { markings: { where: { foundDuringWork: false } } },
  });

  if (!existing) {
    const inspection = await prisma.damageInspection.create({
      data: {
        jobCardId,
        stage: "PRE_SERVICE",
        inspectedByUserId: req.user!.sub,
        markings: {
          create: markings.map((m) => ({
            ...fields(m),
            approvalStatus: m.isAdditionalRepairOffer ? "PENDING" : "NOT_APPLICABLE",
          })),
        },
      },
      include: { markings: { include: { damageType: true } } },
    });
    res.status(201).json(inspection);
    return;
  }

  const byId = new Map(existing.markings.map((m) => [m.id, m]));
  const foreign = markings.filter((m) => m.id && !byId.has(m.id));
  if (foreign.length > 0) throw new AppError(400, "A marker doesn't belong to this inspection — reload the page and try again");
  const keptIds = new Set(markings.map((m) => m.id).filter(Boolean));
  const removed = existing.markings.filter((m) => !keptIds.has(m.id));

  let changed = removed.length > 0 || markings.some((m) => !m.id);
  let offersChanged = removed.some((m) => m.isAdditionalRepairOffer);
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  for (const m of markings) {
    const data = fields(m);
    if (!m.id) {
      if (data.isAdditionalRepairOffer) offersChanged = true;
      ops.push(
        prisma.damageMarking.create({
          data: { ...data, damageInspectionId: existing.id, approvalStatus: data.isAdditionalRepairOffer ? "PENDING" : "NOT_APPLICABLE" },
        }),
      );
      continue;
    }
    const old = byId.get(m.id)!;
    const sameOffer =
      old.isAdditionalRepairOffer === data.isAdditionalRepairOffer &&
      Number(old.suggestedPrice ?? 0) === Number(data.suggestedPrice ?? 0);
    const same =
      sameOffer &&
      old.x === data.x &&
      old.y === data.y &&
      old.z === data.z &&
      old.damageTypeId === data.damageTypeId &&
      old.note === data.note &&
      old.severity === data.severity &&
      old.photoUrl === data.photoUrl;
    if (same) continue;
    changed = true;
    // A repair the customer already decided keeps that decision unless
    // the offer itself (repair yes/no or its price) changed.
    const decision = sameOffer
      ? {}
      : { approvalStatus: data.isAdditionalRepairOffer ? ("PENDING" as const) : ("NOT_APPLICABLE" as const), decidedAt: null };
    if (!sameOffer) offersChanged = true;
    ops.push(prisma.damageMarking.update({ where: { id: m.id }, data: { ...data, ...decision } }));
  }
  if (removed.length > 0) ops.push(prisma.damageMarking.deleteMany({ where: { id: { in: removed.map((m) => m.id) } } }));

  if (changed) {
    // The customer confirmed a different report — they need to see and
    // confirm the edited one (same link keeps working).
    ops.push(
      prisma.damageInspection.update({
        where: { id: existing.id },
        data: {
          inspectedByUserId: req.user!.sub,
          customerAcknowledged: false,
          acknowledgedAt: null,
          acknowledgedVia: null,
          sentToCustomerAt: null,
        },
      }),
    );
    await prisma.$transaction(ops);
    if (offersChanged) await recalculateInvoiceIfExists(jobCardId);
  }

  const inspection = await prisma.damageInspection.findUniqueOrThrow({
    where: { id: existing.id },
    include: { markings: { include: { damageType: true }, orderBy: { createdAt: "asc" } } },
  });
  res.json(inspection);
}

export async function profit(req: Request, res: Response) {
  const breakdown = await calculateJobCardProfit(req.params.id);
  res.json(breakdown);
}

/**
 * Uploads a close-up photo for one damage marking and just returns its
 * URL — not tied to a job card or an existing DamageMarking row, since
 * the marking itself doesn't exist server-side yet at the point a staff
 * member attaches a photo while filling in the marker form (markings are
 * only persisted in bulk by createDamageInspection above, once "Save
 * Inspection" is clicked). Same shape as siteContentController.uploadImage.
 */
export async function uploadDamagePhoto(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new AppError(400, "photo file is required");
  res.status(201).json({ url: `/uploads/damage-markings/${file.filename}` });
}

export async function uploadPhoto(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new AppError(400, "photo file is required");
  const type = req.body.type as "BEFORE" | "AFTER" | "PROGRESS";
  if (type !== "BEFORE" && type !== "AFTER" && type !== "PROGRESS") {
    throw new AppError(400, "type must be BEFORE, AFTER or PROGRESS");
  }

  const jobCard = await prisma.jobCard.findUnique({ where: { id: req.params.id }, include: jobCardInclude });
  if (!jobCard) throw new AppError(404, "Job card not found");

  const photo = await prisma.photo.create({
    data: {
      jobCardId: req.params.id,
      type,
      url: `/uploads/photos/${file.filename}`,
    },
  });

  await recordPhotoUploadedJobNotification(jobCard, req.user?.type === "staff" ? req.user.sub : null, type);

  res.status(201).json(photo);
}

/** A technician sharing one specific work photo over WhatsApp right away,
 *  rather than waiting for the next automatic status-transition update. */
export async function sendPhotoWhatsApp(req: Request, res: Response) {
  const jobCard = await prisma.jobCard.findUnique({ where: { id: req.params.id }, include: jobCardInclude });
  if (!jobCard) throw new AppError(404, "Job card not found");

  const photo = jobCard.photos.find((p) => p.id === req.params.photoId);
  if (!photo) throw new AppError(404, "Photo not found on this job card");

  const notification = await sendJobPhotoWhatsApp(jobCard.booking, photo.url);
  await recordPhotosSentJobNotification(jobCard, req.user?.type === "staff" ? req.user.sub : null);
  res.status(201).json(notification);
}

/** Job Board's one-click "Send Images" button — sends the job card's
 *  latest work photo to the customer without requiring a specific photoId,
 *  and logs the send to the admin-facing Job Notifications feed. */
export async function sendImagesWhatsApp(req: Request, res: Response) {
  const jobCard = await prisma.jobCard.findUnique({ where: { id: req.params.id }, include: jobCardInclude });
  if (!jobCard) throw new AppError(404, "Job card not found");

  const notification = await sendLatestJobPhotoWhatsApp(jobCard.booking, jobCard.id, jobCard.status);
  await recordPhotosSentJobNotification(jobCard, req.user?.type === "staff" ? req.user.sub : null);
  res.status(201).json(notification);
}

// ---- Booked-job flow (see services/jobFlowService.ts) ----

export async function flowBays(_req: Request, res: Response) {
  res.json(await jobFlow.listBays());
}

export async function checkInBay(req: Request, res: Response) {
  await jobFlow.checkInBay(req.params.id, req.body.bayId);
  res.json({ ok: true });
}

export async function startCooldown(req: Request, res: Response) {
  await jobFlow.startCooldown(req.params.id, req.body.minutes);
  res.json({ ok: true });
}

export async function finishCooldown(req: Request, res: Response) {
  await jobFlow.finishCooldown(req.params.id);
  res.json({ ok: true });
}

export async function sendTiming(req: Request, res: Response) {
  res.json(await jobFlow.sendTiming(req.params.id, req.body.waiting, new Date(req.body.readyAt), req.body.send));
}

export async function addExtraWork(req: Request, res: Response) {
  res.status(201).json(await jobFlow.addExtraWork(req.params.id, req.body, req.user!.sub));
}

export async function removeExtraWork(req: Request, res: Response) {
  await jobFlow.removeExtraWork(req.params.id, req.params.markingId);
  res.status(204).send();
}
