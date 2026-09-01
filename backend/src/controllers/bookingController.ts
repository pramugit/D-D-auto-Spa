import type { Request, Response } from "express";
import type { Booking } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import {
  claimBooking,
  createBooking,
  getAvailability,
  getBookingActivityLog,
  getCurrentOwnerRole,
  transitionBookingStatus,
} from "../services/bookingService";
import { safeCustomerSelect, safeStaffSelect } from "../utils/prismaSelects";

const bookingInclude = {
  vehicle: true,
  customer: { select: safeCustomerSelect },
  bay: true,
  currentOwner: { select: safeStaffSelect },
  services: { include: { service: true, package: true } },
  jobCard: {
    include: {
      photos: true,
      damageInspections: true,
      invoice: { include: { payments: true } },
      review: true,
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
    orderBy: { scheduledAt: "desc" },
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
  res.json(withOwnerRole(booking));
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
  });
  res.status(201).json(withOwnerRole(booking));
}

export async function availability(req: Request, res: Response) {
  const { date, durationMinutes } = (req as unknown as {
    validatedQuery: { date: string; durationMinutes?: number };
  }).validatedQuery;
  const result = await getAvailability(date, durationMinutes);
  res.json(result);
}

export async function updateStatus(req: Request, res: Response) {
  const booking = await transitionBookingStatus(req.params.id, req.body.status, {
    userId: req.user!.type === "staff" ? req.user!.sub : null,
    role: req.user!.type === "staff" ? req.user!.role : undefined,
    notes: req.body.notes,
  });
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
