import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import type { BookingStatus } from "@prisma/client";

const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 17;
const SLOT_GRANULARITY_MINUTES = 30;
const DEFAULT_SERVICE_DURATION_MINUTES = 60;

export const BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["QUALITY_CHECK"],
  QUALITY_CHECK: ["READY"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

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
    include: { services: { include: { service: true, package: true } }, vehicle: true, customer: true },
  });

  return booking;
}

/** Total estimated duration (minutes) of a booking's line items. */
async function bookingDurationMinutes(bookingId: string): Promise<number> {
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

export async function transitionBookingStatus(bookingId: string, nextStatus: BookingStatus) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { jobCard: true } });
  if (!booking) throw new AppError(404, "Booking not found");

  const allowed = BOOKING_STATUS_TRANSITIONS[booking.status];
  if (!allowed.includes(nextStatus)) {
    throw new AppError(400, `Cannot transition booking from ${booking.status} to ${nextStatus}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({ where: { id: bookingId }, data: { status: nextStatus } });

    if (nextStatus === "CONFIRMED") {
      await tx.jobCard.upsert({
        where: { bookingId },
        update: {},
        create: { bookingId, status: "CONFIRMED" },
      });
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

    return updated;
  });
}
