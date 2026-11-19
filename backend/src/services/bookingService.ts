import { ITEMS_SELECT, REPAIRS_SELECT, bookingMinutes, packageMinutes } from "./durationService";
import { prisma } from "../utils/prisma";
import * as schedule from "./scheduleService";
import { AppError } from "../utils/AppError";
import { assertReadyToStart } from "./damageInspectionService";
import { releaseBay } from "./jobFlowService";
import type { BookingStatus, NotificationChannel, NotificationType, StaffRole } from "@prisma/client";
import { createAndSendNotification, sendWhatsAppProgressUpdate } from "./notificationService";
import { safeCustomerSelect } from "../utils/prismaSelects";
import { PERMISSIONS } from "../config/permissions";

export const BUSINESS_START_HOUR = 10;
export const BUSINESS_END_HOUR = 18;
const SLOT_GRANULARITY_MINUTES = 30;
// The service station's single physical location — 431/D, Ihala Kosgama, Kosgama (Sri Lanka)
// (UTC+5:30) — used to anchor BUSINESS_START_HOUR/BUSINESS_END_HOUR (and
// "today") to the station's actual wall-clock day rather than the server's
// UTC day, so a slot at BUSINESS_START_HOUR shows as that hour in the
// customer's browser (customers are all in this one timezone; see also
// WHATSAPP_DEFAULT_COUNTRY_CODE="94").
const BUSINESS_TZ_OFFSET_MINUTES = 330;
const DEFAULT_SERVICE_DURATION_MINUTES = 60;

// Every status transition the customer needs to hear about. PENDING is
// handled separately in createBooking (it's the booking's initial value,
// not something transitionBookingStatus ever transitions *into*).
const CUSTOMER_NOTIFICATION_BY_STATUS: Partial<
  Record<BookingStatus, { type: NotificationType; message: string; channel: NotificationChannel }>
> = {
  CONFIRMED: {
    type: "BOOKING_CONFIRMED",
    message: "Your booking has been confirmed. We look forward to seeing you!",
    channel: "EMAIL",
  },
  IN_PROGRESS: {
    type: "JOB_STARTED",
    message: "Work on your vehicle has started.",
    channel: "SMS",
  },
  QUALITY_CHECK: {
    type: "JOB_QUALITY_CHECK",
    message: "Your vehicle is undergoing a final quality check.",
    channel: "SMS",
  },
  READY: {
    type: "JOB_READY",
    message: "Your vehicle is ready for pickup!",
    channel: "SMS",
  },
  CANCELLED: {
    type: "BOOKING_CANCELLED",
    message: "Your booking has been cancelled.",
    channel: "EMAIL",
  },
};

// WhatsApp fires on the same milestones as the SMS/EMAIL map above, plus
// COMPLETED and PENDING (booking received) which don't get a separate
// SMS/EMAIL) — same trigger points in transitionBookingStatus/createBooking
// below, just a second lookup/send alongside the existing one rather than
// a separate hook elsewhere in the codebase.
const WHATSAPP_NOTIFICATION_TYPE_BY_STATUS: Partial<Record<BookingStatus, NotificationType>> = {
  PENDING: "BOOKING_RECEIVED",
  CONFIRMED: "BOOKING_CONFIRMED",
  IN_PROGRESS: "JOB_STARTED",
  QUALITY_CHECK: "JOB_QUALITY_CHECK",
  READY: "JOB_READY",
  COMPLETED: "JOB_COMPLETED",
  CANCELLED: "BOOKING_CANCELLED",
};

export const BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["QUALITY_CHECK"],
  QUALITY_CHECK: ["READY"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

// Max minutes a booking should sit in a given status before it needs
// attention. Tune freely; statuses omitted here have no SLA (e.g. READY
// depends on the customer showing up, not staff pace).
export const STATUS_SLA_MINUTES: Partial<Record<BookingStatus, number>> = {
  PENDING: 60,
  CONFIRMED: 120,
  IN_PROGRESS: 180,
  QUALITY_CHECK: 30,
};

// Who is responsible for a booking while it sits in each status. Purely a
// display/claim concept — does not gate every transition, only the three
// specific ones below that Phase B calls out.
const OWNER_ROLE_BY_STATUS: Record<BookingStatus, StaffRole | null> = {
  PENDING: "RECEPTIONIST",
  CONFIRMED: "RECEPTIONIST",
  IN_PROGRESS: "TECHNICIAN",
  QUALITY_CHECK: "MANAGER",
  READY: "RECEPTIONIST",
  COMPLETED: null,
  CANCELLED: null,
};

export function getCurrentOwnerRole(status: BookingStatus): StaffRole | null {
  return OWNER_ROLE_BY_STATUS[status];
}

// Per-destination-status role requirements, keyed by the destination
// status. ADMIN can always perform any transition (existing pattern
// throughout this codebase). Not applied when actor.role is omitted —
// the invoice-triggered auto-completion of READY->COMPLETED is a system
// consequence of full payment, not a specific staff member acting out
// of turn, so it intentionally bypasses this check (see
// transitionBookingStatus).
//
// CONFIRMED/READY/COMPLETED are Bookings-section actions (confirming,
// approving quality, closing out) — Phase B's original three. IN_PROGRESS
// and QUALITY_CHECK are pure Job Board Kanban actions, so those two are
// sourced straight from the single permissions matrix's jobBoard.edit
// list (which excludes RECEPTIONIST, matching their read-only Job Board
// access) instead of a separately hand-maintained array.
const TRANSITION_REQUIRES_ROLE: Partial<Record<BookingStatus, StaffRole[]>> = {
  CONFIRMED: ["RECEPTIONIST", "MANAGER", "ADMIN"], // PENDING -> CONFIRMED
  IN_PROGRESS: PERMISSIONS.jobBoard.edit, // CONFIRMED -> IN_PROGRESS
  QUALITY_CHECK: PERMISSIONS.jobBoard.edit, // IN_PROGRESS -> QUALITY_CHECK
  READY: ["MANAGER", "ADMIN"], // QUALITY_CHECK -> READY
  COMPLETED: ["RECEPTIONIST", "MANAGER", "ADMIN"], // READY -> COMPLETED
};

/**
 * Least-busy-technician auto-assignment: picks the TECHNICIAN with the
 * fewest currently-active (not COMPLETED/CANCELLED) job cards. Ties break
 * on whichever technician sorts first — good enough for a starting
 * suggestion; staff can always override via the existing
 * PATCH /job-cards/:id/assign-technician endpoint.
 */
export async function pickLeastBusyTechnician(): Promise<string | null> {
  const technicians = await prisma.user.findMany({ where: { role: "TECHNICIAN", active: true }, select: { id: true } });
  if (technicians.length === 0) return null;

  const activeCounts = await prisma.jobCardTechnician.groupBy({
    by: ["userId"],
    where: { jobCard: { status: { notIn: ["COMPLETED", "CANCELLED"] } } },
    _count: { jobCardId: true },
  });
  const countByUserId = new Map(activeCounts.map((c) => [c.userId, c._count.jobCardId]));

  return technicians.reduce((leastBusy, t) => {
    const count = countByUserId.get(t.id) ?? 0;
    const leastBusyCount = countByUserId.get(leastBusy) ?? 0;
    return count < leastBusyCount ? t.id : leastBusy;
  }, technicians[0].id);
}

export interface BookingLineItem {
  serviceId?: string;
  packageId?: string;
}

/** Resolves price + duration for one booking line item against a vehicle type. */
export async function resolveLineItem(item: BookingLineItem, vehicleType: string) {
  if (item.serviceId) {
    const service = await prisma.service.findUnique({
      where: { id: item.serviceId },
      include: { pricing: true },
    });
    if (!service || !service.active) throw new AppError(400, `Service ${item.serviceId} not found or inactive`);
    const pricing = service.pricing.find((p) => p.vehicleType === vehicleType);
    if (!pricing) throw new AppError(400, `Service "${service.name}" has no price defined for vehicle type ${vehicleType}`);
    return { serviceId: service.id, packageId: null, price: pricing.price, durationMinutes: service.durationMinutes };
  }

  const pkg = await prisma.servicePackage.findUnique({
    where: { id: item.packageId },
    include: { services: { include: { service: true } } },
  });
  if (!pkg || !pkg.active) throw new AppError(400, `Package ${item.packageId} not found or inactive`);
  return { serviceId: null, packageId: pkg.id, price: pkg.discountedPrice, durationMinutes: packageMinutes(pkg) };
}

export async function createBooking(input: {
  customerId: string;
  vehicleId: string;
  scheduledAt: Date;
  items: BookingLineItem[];
  isWalkIn?: boolean;
  /** Booked by the customer themselves — their booking rules apply (notice, days ahead). */
  byCustomer?: boolean;
}) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } });
  if (!vehicle) throw new AppError(404, "Vehicle not found");
  if (vehicle.customerId !== input.customerId) {
    throw new AppError(403, "Vehicle does not belong to this customer");
  }

  const resolvedItems = await Promise.all(
    input.items.map((item) => resolveLineItem(item, vehicle.vehicleType))
  );

  // Time management: a scheduled booking must fit the opening hours and a
  // free bay (checked here, server-side, so two people can't take the same
  // slot); it's given that bay straight away. Walk-ins start now and take
  // whichever bay is free (or none, if every bay is busy).
  const durationMinutes = resolvedItems.reduce((sum, r) => sum + (r.durationMinutes ?? 0), 0);
  const bayId = input.isWalkIn
    ? await schedule.bayForWalkIn(durationMinutes)
    : await schedule.claimSlot(new Date(input.scheduledAt), durationMinutes, { customer: !!input.byCustomer });

  const booking = await prisma.booking.create({
    data: {
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      scheduledAt: input.scheduledAt,
      bayId,
      status: "PENDING",
      isWalkIn: input.isWalkIn ?? false,
      services: {
        create: resolvedItems.map((r) => ({
          serviceId: r.serviceId,
          packageId: r.packageId,
          price: r.price,
        })),
      },
    },
    include: {
      services: { include: { service: true, package: true } },
      vehicle: true,
      customer: { select: safeCustomerSelect },
    },
  });

  // PENDING is the booking's initial value, never something
  // transitionBookingStatus transitions *into* — so its WhatsApp "request
  // received" notification fires here instead of that function.
  await sendWhatsAppProgressUpdate(booking, null, "PENDING", WHATSAPP_NOTIFICATION_TYPE_BY_STATUS.PENDING!);

  return booking;
}

/**
 * A walk-in job — a customer who showed up without a prior booking. Same
 * pipeline and JobCard lifecycle as a scheduled booking (Confirmed -> In
 * Progress -> Quality Check -> Ready -> Completed), just entered through a
 * faster path: created with scheduledAt=now and immediately auto-confirmed
 * (no separate receptionist confirmation step, since the customer is
 * already standing there), which also creates its JobCard the same way
 * transitionBookingStatus always does on reaching CONFIRMED.
 */
export async function createWalkInJob(input: {
  customerId: string;
  vehicleId: string;
  items: BookingLineItem[];
  mileage?: number;
  actor: TransitionActor;
}) {
  const booking = await createBooking({
    customerId: input.customerId,
    vehicleId: input.vehicleId,
    scheduledAt: new Date(),
    items: input.items,
    isWalkIn: true,
  });
  // Odometer at drop-off: kept on this job and as the vehicle's latest reading.
  if (input.mileage !== undefined) {
    await prisma.booking.update({ where: { id: booking.id }, data: { mileage: input.mileage } });
    await prisma.vehicle.update({ where: { id: input.vehicleId }, data: { mileage: input.mileage } });
  }
  // Deliberately drop actor.role here: TRANSITION_REQUIRES_ROLE's CONFIRMED
  // entry (RECEPTIONIST/MANAGER/ADMIN) governs the Bookings section's manual
  // "confirm this appointment" action. A walk-in's confirmation is implicit
  // in its creation — already gated by jobBoard.edit at the route level,
  // which also allows TECHNICIAN — so this transition is system-triggered,
  // same as the payment-triggered auto-completion's role-less call.
  return transitionBookingStatus(booking.id, "CONFIRMED", { userId: input.actor.userId });
}

/** Estimated minutes for a booking: its services/packages plus any damage repairs added at inspection. */
export async function bookingDurationMinutes(bookingId: string): Promise<number> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { services: { select: ITEMS_SELECT }, jobCard: { select: REPAIRS_SELECT } },
  });
  return b ? bookingMinutes(b) : DEFAULT_SERVICE_DURATION_MINUTES;
}

/** Free slots for a day — see scheduleService (opening hours, holidays, bays, buffer, customer rules). */
export async function getAvailability(dateStr: string, requestedDurationMinutes?: number, q: schedule.SlotQuery = {}) {
  return schedule.getAvailability(dateStr, requestedDurationMinutes, q);
}

export interface TransitionActor {
  /** The JWT-authenticated staff user performing the transition, or null
   *  if it was the customer themselves (e.g. a future customer-initiated
   *  cancellation) — never a manually-typed name. */
  userId: string | null;
  /** The actor's staff role, used to enforce TRANSITION_REQUIRES_ROLE for
   *  manual staff-driven calls. Omit for system-triggered transitions
   *  (e.g. the payment-reconciliation auto-completion) to skip that
   *  check — see the constant's own comment for why. */
  role?: StaffRole;
  notes?: string;
}

export async function transitionBookingStatus(
  bookingId: string,
  nextStatus: BookingStatus,
  actor: TransitionActor = { userId: null }
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      jobCard: true,
      customer: { select: { name: true } },
      vehicle: { select: { make: true, model: true, plateNumber: true } },
    },
  });
  if (!booking) throw new AppError(404, "Booking not found");

  const allowed = BOOKING_STATUS_TRANSITIONS[booking.status];
  if (!allowed.includes(nextStatus)) {
    throw new AppError(400, `Cannot transition booking from ${booking.status} to ${nextStatus}`);
  }

  if (actor.role) {
    const requiredRoles = TRANSITION_REQUIRES_ROLE[nextStatus];
    if (requiredRoles && !requiredRoles.includes(actor.role)) {
      throw new AppError(
        403,
        `Only ${requiredRoles.join("/")} can move a booking from ${booking.status} to ${nextStatus}`
      );
    }
  }

  // A scheduled booking can't start until its pre-service damage
  // inspection is done and confirmed by the customer (see
  // damageInspectionService). Walk-ins are inspected with the customer
  // standing there during Daily Jobs intake, so they aren't held up here.
  if (nextStatus === "IN_PROGRESS" && !booking.isWalkIn) {
    if (!booking.jobCard) throw new AppError(400, "This booking has no job card yet");
    await assertReadyToStart(booking.jobCard.id);
  }

  // A walk-in (Daily Jobs) is handed back only once it's paid for: staff
  // press "Completed" after taking payment, so READY -> COMPLETED is
  // refused while the invoice isn't fully paid. Scheduled bookings keep
  // their existing behaviour.
  if (nextStatus === "COMPLETED" && booking.isWalkIn) {
    const invoice = booking.jobCard
      ? await prisma.invoice.findUnique({ where: { jobCardId: booking.jobCard.id }, select: { status: true } })
      : null;
    if (invoice?.status !== "PAID") {
      throw new AppError(400, "This daily job can only be completed after the customer has paid the invoice in full");
    }
  }

  const fromStatus = booking.status;

  // Ownership resets on every transition — a new stage starts unclaimed —
  // except IN_PROGRESS, where it's auto-filled from the job card's
  // assignment if exactly one technician is assigned (unambiguous). With
  // zero or several technicians it stays null and the UI shows the full
  // assigned list instead of a single owner.
  let nextOwnerUserId: string | null = null;
  if (nextStatus === "IN_PROGRESS") {
    const technicians = await prisma.jobCardTechnician.findMany({
      where: { jobCard: { bookingId } },
      select: { userId: true },
    });
    if (technicians.length === 1) nextOwnerUserId = technicians[0].userId;
  }

  // Auto-suggest (and assign) the least-busy technician when the job card
  // is first created, so staff aren't required to pick one manually every
  // time — they can still override via the existing assign-technician
  // endpoint at any point afterward.
  const suggestedTechnicianId = nextStatus === "CONFIRMED" ? await pickLeastBusyTechnician() : null;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.booking.update({
      where: { id: bookingId },
      data: { status: nextStatus, currentOwnerUserId: nextOwnerUserId },
    });

    // Automatic side effect of every transition — never a manual staff
    // entry. This is the sole write path for BookingActivityLog.
    await tx.bookingActivityLog.create({
      data: {
        bookingId,
        fromStatus,
        toStatus: nextStatus,
        changedByUserId: actor.userId,
        notes: actor.notes,
      },
    });

    if (nextStatus === "CONFIRMED") {
      const jobCard = await tx.jobCard.upsert({
        where: { bookingId },
        update: {},
        create: { bookingId, status: "CONFIRMED" },
      });
      if (suggestedTechnicianId) {
        await tx.jobCardTechnician.upsert({
          where: { jobCardId_userId: { jobCardId: jobCard.id, userId: suggestedTechnicianId } },
          update: {},
          create: { jobCardId: jobCard.id, userId: suggestedTechnicianId },
        });
      }
    } else if (booking.jobCard) {
      const jobCardData: { status: BookingStatus; startedAt?: Date; completedAt?: Date } = {
        status: nextStatus,
      };
      if (nextStatus === "IN_PROGRESS" && !booking.jobCard.startedAt) {
        jobCardData.startedAt = new Date();
      }
      if (nextStatus === "COMPLETED") {
        jobCardData.completedAt = new Date();
      }
      await tx.jobCard.update({ where: { bookingId }, data: jobCardData });
    }

    return result;
  });

  // The car has left (or never needs) its bay once the work is done.
  if (nextStatus === "READY" || nextStatus === "COMPLETED" || nextStatus === "CANCELLED") {
    await releaseBay(bookingId);
  }

  // Fire-and-record notifications on every customer-relevant milestone.
  // sendNotification itself is a stub — see notificationService.ts for
  // where a real SMS/email/WhatsApp provider plugs in.
  const notification = CUSTOMER_NOTIFICATION_BY_STATUS[nextStatus];
  if (notification) {
    await createAndSendNotification({
      customerId: booking.customerId,
      type: notification.type,
      message: notification.message,
      channel: notification.channel,
    });
  }

  // Materials are NOT taken out of stock automatically when a job starts —
  // staff record what was actually used by hand (Daily Jobs step 7 /
  // job card "Inventory Used"), which deducts stock item by item.

  const whatsappType = WHATSAPP_NOTIFICATION_TYPE_BY_STATUS[nextStatus];
  if (whatsappType) {
    await sendWhatsAppProgressUpdate(booking, booking.jobCard?.id ?? null, nextStatus, whatsappType);
  }

  return updated;
}

/**
 * Lets a staff member claim ownership of a booking sitting in a status
 * that has an owner role, provided their role matches it (ADMIN can
 * always claim). Two technicians can't both think someone else has it —
 * claiming an already-claimed booking re-assigns it (last claim wins;
 * there's no lock).
 */
export async function claimBooking(bookingId: string, actor: { userId: string; role: StaffRole }) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError(404, "Booking not found");

  const ownerRole = getCurrentOwnerRole(booking.status);
  if (!ownerRole) {
    throw new AppError(400, `${booking.status} bookings don't have a claimable owner`);
  }
  if (actor.role !== ownerRole && actor.role !== "ADMIN") {
    throw new AppError(403, `Only ${ownerRole} (or ADMIN) can claim a booking at ${booking.status}`);
  }

  return prisma.booking.update({ where: { id: bookingId }, data: { currentOwnerUserId: actor.userId } });
}

export async function getBookingActivityLog(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError(404, "Booking not found");

  return prisma.bookingActivityLog.findMany({
    where: { bookingId },
    orderBy: { createdAt: "asc" },
    include: { changedByUser: { select: { id: true, name: true, role: true } } },
  });
}

/**
 * When the booking entered its current status — the createdAt of the most
 * recent activity log row, or the booking's own createdAt if it's still in
 * its initial PENDING status (no transition has happened yet). Used by
 * Phase C's SLA check instead of a duplicated timestamp column on Booking.
 */
export async function getStatusEnteredAt(bookingId: string): Promise<Date> {
  const latest = await prisma.bookingActivityLog.findFirst({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (latest) return latest.createdAt;
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { createdAt: true } });
  return booking?.createdAt ?? new Date();
}

export interface AttentionBooking {
  id: string;
  status: BookingStatus;
  // Null for PENDING bookings — the job card isn't created until
  // CONFIRMED, so a PENDING booking flagged for an SLA breach has
  // nothing to link a "view job card" action to yet.
  jobCardId: string | null;
  currentOwnerRole: StaffRole | null;
  currentOwnerUserId: string | null;
  statusEnteredAt: Date;
  minutesInStatus: number;
  slaMinutes: number | null;
  slaBreached: boolean;
  unassigned: boolean;
  /** Daily Jobs walk-in (true) or scheduled booking (false). */
  isWalkIn: boolean;
  customer: { id: string; name: string };
  vehicle: { id: string; plateNumber: string; make: string; model: string };
}

/**
 * Read-only computed query — no background job. A booking needs
 * attention if it has sat in its current status past that status's SLA,
 * or if it has no owner despite being past PENDING (CONFIRMED or later,
 * excluding the terminal COMPLETED/CANCELLED statuses this query already
 * excludes). Compares getStatusEnteredAt() against now for each active
 * booking.
 */
export async function getBookingsNeedingAttention(): Promise<AttentionBooking[]> {
  const activeBookings = await prisma.booking.findMany({
    where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
    include: {
      customer: { select: { id: true, name: true } },
      vehicle: { select: { id: true, plateNumber: true, make: true, model: true } },
      jobCard: { select: { id: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const now = Date.now();
  const results: AttentionBooking[] = [];

  for (const booking of activeBookings) {
    const statusEnteredAt = await getStatusEnteredAt(booking.id);
    const minutesInStatus = Math.round((now - statusEnteredAt.getTime()) / 60000);
    const slaMinutes = STATUS_SLA_MINUTES[booking.status] ?? null;
    const slaBreached = slaMinutes !== null && minutesInStatus > slaMinutes;
    const unassigned = booking.status !== "PENDING" && !booking.currentOwnerUserId;

    if (slaBreached || unassigned) {
      results.push({
        id: booking.id,
        status: booking.status,
        jobCardId: booking.jobCard?.id ?? null,
        currentOwnerRole: getCurrentOwnerRole(booking.status),
        currentOwnerUserId: booking.currentOwnerUserId,
        statusEnteredAt,
        minutesInStatus,
        slaMinutes,
        slaBreached,
        unassigned,
        isWalkIn: booking.isWalkIn,
        customer: booking.customer,
        vehicle: booking.vehicle,
      });
    }
  }

  return results;
}

/**
 * Move a booking to a new time (staff, or the customer within their change
 * window). Re-checks the slot, re-picks a bay, logs it on the booking's
 * timeline and tells the customer on WhatsApp.
 */
export async function rescheduleBooking(
  bookingId: string,
  newStart: Date,
  actor: { userId: string | null; customerId?: string; notes?: string }
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: { select: { name: true } },
      vehicle: { select: { plateNumber: true, make: true, model: true } },
      services: { include: { service: true, package: { include: { services: { include: { service: true } } } } } },
    },
  });
  if (!booking) throw new AppError(404, "Booking not found");
  if (actor.customerId && booking.customerId !== actor.customerId) throw new AppError(403, "Not your booking");
  // Requests get their time through propose-time / accept-time instead.
  if (booking.requestStage === "REQUESTED" || booking.requestStage === "TIME_PROPOSED") {
    throw new AppError(
      400,
      actor.customerId
        ? "Please confirm the offered time or ask for another time instead."
        : "This is a booking request — use “Set date & time” to send the customer a time."
    );
  }
  if (!["PENDING", "CONFIRMED"].includes(booking.status)) {
    throw new AppError(400, "Only bookings that haven't started can be moved.");
  }
  if (booking.isWalkIn) throw new AppError(400, "Walk-in jobs don't have a booked time to move.");
  if (actor.customerId) {
    const s = await schedule.getScheduleSettings();
    if (booking.scheduledAt.getTime() - Date.now() < s.customerChangeHours * 3600000) {
      throw new AppError(400, `Bookings can be changed online up to ${s.customerChangeHours} hours before. Please call us to change it now.`);
    }
  }
  const minutes = await bookingDurationMinutes(bookingId);
  const bayId = await schedule.claimSlot(newStart, minutes, { customer: !!actor.customerId, excludeBookingId: bookingId });
  const fmt = (d: Date) =>
    d.toLocaleString("en-GB", { timeZone: "Asia/Colombo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const from = fmt(booking.scheduledAt);
  const to = fmt(newStart);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.booking.update({ where: { id: bookingId }, data: { scheduledAt: newStart, bayId } });
    await tx.bookingActivityLog.create({
      data: {
        bookingId,
        fromStatus: booking.status,
        toStatus: booking.status,
        changedByUserId: actor.userId,
        notes: `Rescheduled from ${from} to ${to}${actor.customerId ? " (by the customer)" : ""}${actor.notes ? ` — ${actor.notes}` : ""}`,
      },
    });
    return u;
  });

  await createAndSendNotification({
    customerId: booking.customerId,
    type: "GENERAL",
    channel: "WHATSAPP",
    message: `Hi ${booking.customer.name}, your booking for ${booking.vehicle.make} ${booking.vehicle.model} (${booking.vehicle.plateNumber}) has been moved to ${to}. See you then!`,
  }).catch((err) => console.error("[schedule] reschedule notification failed:", err));

  return updated;
}
