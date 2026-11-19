import type { Request, Response } from "express";
import type { Booking } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import * as schedule from "../services/scheduleService";
import { bookingDurationMinutes, rescheduleBooking } from "../services/bookingService";
import * as requests from "../services/bookingRequestService";
import {
  claimBooking,
  createBooking,
  createWalkInJob,
  getAvailability,
  getBookingActivityLog,
  getBookingsNeedingAttention,
  getCurrentOwnerRole,
  transitionBookingStatus,
} from "../services/bookingService";
import { safeCustomerSelect, safeStaffSelect } from "../utils/prismaSelects";
import { createInvoiceForJobCard } from "../services/invoiceService";

const bookingInclude = {
  vehicle: true,
  customer: { select: safeCustomerSelect },
  bay: true,
  currentOwner: { select: safeStaffSelect },
  services: { include: { service: true, package: true } },
  jobCard: {
    include: {
      photos: true,
      damageInspections: { include: { markings: { include: { damageType: true } }, inspectedByUser: { select: safeStaffSelect } } },
      invoice: { include: { payments: true } },
      review: true,
      // Who's working on the car — customer-relevant, unlike most of the
      // rest of the staff-only JobCard shape (see JobCardDetailPage),
      // which is why this is the one relation added here even though the
      // Booking type comment below still calls this a "lighter" shape.
      technicians: { include: { user: { select: safeStaffSelect } } },
    },
  },
} as const;

/** Adds the computed currentOwnerRole alongside the stored currentOwnerUserId/currentOwner. */
function withOwnerRole<T extends { status: Booking["status"] }>(booking: T) {
  return { ...booking, currentOwnerRole: getCurrentOwnerRole(booking.status) };
}

export async function list(req: Request, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  if (req.user?.type === "customer") {
    where.customerId = req.user.sub;
  } else if (typeof req.query.customerId === "string") {
    where.customerId = req.query.customerId;
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: bookingInclude,
    orderBy: { createdAt: "desc" },
  });
  res.json(bookings.map(withOwnerRole));
}

export async function get(req: Request, res: Response) {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: bookingInclude,
  });
  if (!booking) throw new AppError(404, "Booking not found");
  if (req.user?.type === "customer" && booking.customerId !== req.user.sub) {
    throw new AppError(403, "Not your booking");
  }
  res.json({ ...withOwnerRole(booking), estimatedMinutes: await bookingDurationMinutes(booking.id) });
}

export async function create(req: Request, res: Response) {
  let customerId: string;
  if (req.user?.type === "customer") {
    customerId = req.user.sub;
  } else {
    if (!req.body.customerId) throw new AppError(400, "customerId is required");
    customerId = req.body.customerId;
  }

  const booking = await createBooking({
    customerId,
    vehicleId: req.body.vehicleId,
    scheduledAt: req.body.scheduledAt,
    items: req.body.items,
    byCustomer: req.user?.type === "customer",
  });
  res.status(201).json(withOwnerRole(booking));
}

/** Staff-only quick-create for a walk-in — same pipeline as a scheduled
 *  booking, immediately auto-confirmed since there's no separate approval
 *  step needed for a customer already standing at the counter. */
export async function createWalkIn(req: Request, res: Response) {
  if (req.user?.type !== "staff") throw new AppError(403, "Staff access required");

  const booking = await createWalkInJob({
    customerId: req.body.customerId,
    vehicleId: req.body.vehicleId,
    items: req.body.items,
    mileage: req.body.mileage,
    actor: { userId: req.user.sub, role: req.user.role },
  });
  res.status(201).json(withOwnerRole(booking));
}

/** A customer cancelling their own booking — distinct from the staff-only
 *  /:id/status endpoint, which also handles every other transition. */
export async function cancel(req: Request, res: Response) {
  const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Booking not found");
  if (req.user?.type === "customer" && existing.customerId !== req.user.sub) {
    throw new AppError(403, "Not your booking");
  }
  // Customers can cancel online until the change window before the
  // booking time (Schedule settings); after that, or once work has started,
  // they need to call. Staff can cancel any time via /:id/status.
  if (req.user?.type === "customer") {
    if (!["PENDING", "CONFIRMED"].includes(existing.status)) {
      throw new AppError(400, "Work on this booking has already started. Please contact us directly.");
    }
    // A request that hasn't been confirmed yet can always be withdrawn.
    const unconfirmedRequest = existing.requestStage === "REQUESTED" || existing.requestStage === "TIME_PROPOSED";
    const s = await schedule.getScheduleSettings();
    if (!unconfirmedRequest && existing.scheduledAt.getTime() - Date.now() < s.customerChangeHours * 3600000) {
      throw new AppError(400, `Bookings can be cancelled online up to ${s.customerChangeHours} hours before. Please call us to cancel now.`);
    }
  }
  const booking = await transitionBookingStatus(req.params.id, "CANCELLED", { userId: null });
  res.json(withOwnerRole(booking));
}

export async function availability(req: Request, res: Response) {
  const { date, durationMinutes } = (req as unknown as {
    validatedQuery: { date: string; durationMinutes?: number };
  }).validatedQuery;
  const excludeBookingId = typeof req.query.excludeBookingId === "string" ? req.query.excludeBookingId : undefined;
  // Moving a booking: default to that booking's own length of work.
  const minutes = durationMinutes ?? (excludeBookingId ? await bookingDurationMinutes(excludeBookingId) : undefined);
  const result = await getAvailability(date, minutes, {
    customer: req.user?.type === "customer",
    excludeBookingId,
  });
  res.json(result);
}

export async function attention(_req: Request, res: Response) {
  const bookings = await getBookingsNeedingAttention();
  res.json(bookings);
}

export async function updateStatus(req: Request, res: Response) {
  const booking = await transitionBookingStatus(req.params.id, req.body.status, {
    userId: req.user!.type === "staff" ? req.user!.sub : null,
    role: req.user!.type === "staff" ? req.user!.role : undefined,
    notes: req.body.notes,
  });

  // Auto-draft an invoice the moment a booking reaches QUALITY_CHECK, so
  // staff aren't required to remember a manual "generate invoice" step —
  // it's still just a normal invoice afterward (payable, viewable) via
  // the existing invoice endpoints. QUALITY_CHECK is only ever entered
  // through this endpoint (the state machine has no other path into it),
  // so hooking it here — rather than inside transitionBookingStatus
  // itself — avoids a circular import between bookingService and
  // invoiceService (which already depends on bookingService for the
  // payment-triggered auto-completion).
  if (booking.status === "QUALITY_CHECK") {
    const jobCard = await prisma.jobCard.findUnique({ where: { bookingId: booking.id } });
    if (jobCard) {
      const existingInvoice = await prisma.invoice.findUnique({ where: { jobCardId: jobCard.id } });
      if (!existingInvoice) {
        await createInvoiceForJobCard(jobCard.id);
      }
    }
  }

  res.json(withOwnerRole(booking));
}

export async function claim(req: Request, res: Response) {
  if (req.user!.type !== "staff") throw new AppError(403, "Staff access required");
  const booking = await claimBooking(req.params.id, { userId: req.user!.sub, role: req.user!.role });
  res.json(withOwnerRole(booking));
}

export async function activityLog(req: Request, res: Response) {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking) throw new AppError(404, "Booking not found");
  if (req.user?.type === "customer" && booking.customerId !== req.user.sub) {
    throw new AppError(403, "Not your booking");
  }
  const log = await getBookingActivityLog(req.params.id);
  res.json(log);
}

export async function assignBay(req: Request, res: Response) {
  const booking = await prisma.booking.update({
    where: { id: req.params.id },
    data: { bayId: req.body.bayId },
  });
  res.json(booking);
}

/** Move a booking — staff any time before work starts; customers within their change window. */
export async function reschedule(req: Request, res: Response) {
  const isCustomer = req.user?.type === "customer";
  const booking = await rescheduleBooking(req.params.id, new Date(req.body.scheduledAt), {
    userId: isCustomer ? null : req.user!.sub,
    customerId: isCustomer ? req.user!.sub : undefined,
    notes: req.body.notes,
  });
  res.json(booking);
}

export async function scheduleDay(req: Request, res: Response) {
  const date = String(req.query.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(400, "date must be YYYY-MM-DD");
  res.json(await schedule.daySchedule(date));
}

export async function scheduleWeek(req: Request, res: Response) {
  const start = String(req.query.start ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new AppError(400, "start must be YYYY-MM-DD");
  res.json(await schedule.weekSummary(start, Math.min(31, Number(req.query.days ?? 7) || 7)));
}

/** Opening hours + booking rules. Everyone signed in can read them (the portal shows them). */
export async function scheduleSettings(_req: Request, res: Response) {
  res.json(await schedule.getScheduleSettings());
}

export async function saveScheduleSettings(req: Request, res: Response) {
  res.json(await schedule.saveScheduleSettings(req.body));
}

// ── Booking requests ──
export async function request(req: Request, res: Response) {
  const booking = await requests.createRequest({ customerId: req.user!.sub, ...req.body });
  res.status(201).json(withOwnerRole(booking));
}

export async function proposeTime(req: Request, res: Response) {
  const { booking, sentVia, message } = await requests.proposeTime(req.params.id, new Date(req.body.scheduledAt), {
    userId: req.user!.sub,
    note: req.body.note,
  });
  res.json({ booking: withOwnerRole(booking), sentVia, message });
}

export async function acceptTime(req: Request, res: Response) {
  const booking = await requests.acceptTime(req.params.id, req.user!.sub);
  res.json(withOwnerRole(booking));
}

export async function askAnotherTime(req: Request, res: Response) {
  const booking = await requests.askAnotherTime(req.params.id, req.user!.sub, req.body.message);
  res.json(withOwnerRole(booking));
}
