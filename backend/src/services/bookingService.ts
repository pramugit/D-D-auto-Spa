import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import type { BookingStatus, NotificationChannel, NotificationType, StaffRole } from "@prisma/client";
import { createAndSendNotification } from "./notificationService";
import { safeCustomerSelect } from "../utils/prismaSelects";

export const BUSINESS_START_HOUR = 9;
export const BUSINESS_END_HOUR = 17;
const SLOT_GRANULARITY_MINUTES = 30;
const DEFAULT_SERVICE_DURATION_MINUTES = 60;

// Every status transition the customer needs to hear about. Statuses
// omitted here (QUALITY_CHECK is internal staff work) fire no
// notification.
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

// The three transitions Phase B calls out as needing enforced, on-record
// responsibility, keyed by the destination status. ADMIN can always
// perform any transition (existing pattern throughout this codebase).
// Not applied when actor.role is omitted — the invoice-triggered
// auto-completion of READY->COMPLETED is a system consequence of full
// payment, not a specific staff member acting out of turn, so it
// intentionally bypasses this check (see transitionBookingStatus).
const TRANSITION_REQUIRES_ROLE: Partial<Record<BookingStatus, StaffRole[]>> = {
  CONFIRMED: ["RECEPTIONIST", "MANAGER", "ADMIN"], // PENDING -> CONFIRMED
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
  const technicians = await prisma.user.findMany({ where: { role: "TECHNICIAN" }, select: { id: true } });
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

interface BookingLineItem {
  serviceId?: string;
  packageId?: string;
}

/** Resolves price + duration for one booking line item against a vehicle type. */
async function resolveLineItem(item: BookingLineItem, vehicleType: string) {
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
  const durationMinutes = pkg.services.reduce((sum, s) => sum + s.service.durationMinutes, 0);
  return { serviceId: null, packageId: pkg.id, price: pkg.discountedPrice, durationMinutes };
}

export async function createBooking(input: {
  customerId: string;
  vehicleId: string;
  scheduledAt: Date;
  items: BookingLineItem[];
}) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } });
  if (!vehicle) throw new AppError(404, "Vehicle not found");
  if (vehicle.customerId !== input.customerId) {
    throw new AppError(403, "Vehicle does not belong to this customer");
  }

  const resolvedItems = await Promise.all(
    input.items.map((item) => resolveLineItem(item, vehicle.vehicleType))
  );

  const booking = await prisma.booking.create({
    data: {
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      scheduledAt: input.scheduledAt,
      status: "PENDING",
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

  return booking;
}

/** Total estimated duration (minutes) of a booking's line items. */
export async function bookingDurationMinutes(bookingId: string): Promise<number> {
  const items = await prisma.bookingService.findMany({
    where: { bookingId },
    include: { service: true, package: { include: { services: { include: { service: true } } } } },
  });
  return items.reduce((sum, item) => {
    if (item.service) return sum + item.service.durationMinutes;
    if (item.package) {
      return sum + item.package.services.reduce((s, ps) => s + ps.service.durationMinutes, 0);
    }
    return sum + DEFAULT_SERVICE_DURATION_MINUTES;
  }, 0);
}

export async function getAvailability(dateStr: string, requestedDurationMinutes?: number) {
  const bayCount = await prisma.bay.count({ where: { status: { not: "MAINTENANCE" } } });
  if (bayCount === 0) {
    return { date: dateStr, bayCount: 0, slots: [] };
  }

  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const bookingsOnDate = await prisma.booking.findMany({
    where: {
      scheduledAt: { gte: dayStart, lte: dayEnd },
      status: { notIn: ["CANCELLED"] },
    },
    select: { id: true, scheduledAt: true },
  });

  const bookingsWithDuration = await Promise.all(
    bookingsOnDate.map(async (b) => ({
      start: b.scheduledAt,
      end: new Date(b.scheduledAt.getTime() + (await bookingDurationMinutes(b.id)) * 60000),
    }))
  );

  const duration = requestedDurationMinutes ?? DEFAULT_SERVICE_DURATION_MINUTES;
  const slots: { time: string; available: boolean }[] = [];

  for (
    let minutes = BUSINESS_START_HOUR * 60;
    minutes + duration <= BUSINESS_END_HOUR * 60;
    minutes += SLOT_GRANULARITY_MINUTES
  ) {
    const slotStart = new Date(`${dateStr}T00:00:00.000Z`);
    slotStart.setUTCMinutes(minutes);
    const slotEnd = new Date(slotStart.getTime() + duration * 60000);

    const overlapping = bookingsWithDuration.filter(
      (b) => b.start < slotEnd && slotStart < b.end
    ).length;

    slots.push({
      time: slotStart.toISOString(),
      available: overlapping < bayCount,
    });
  }

  return { date: dateStr, bayCount, slots };
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
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { jobCard: true } });
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

  // Fire-and-record notifications on every customer-relevant milestone.
  // sendNotification itself is a stub — see notificationService.ts for
  // where a real SMS/email provider plugs in.
  const notification = CUSTOMER_NOTIFICATION_BY_STATUS[nextStatus];
  if (notification) {
    await createAndSendNotification({
      customerId: booking.customerId,
      type: notification.type,
      message: notification.message,
      channel: notification.channel,
    });
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
        customer: booking.customer,
        vehicle: booking.vehicle,
      });
    }
  }

  return results;
}
