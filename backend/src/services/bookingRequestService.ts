/**
 * Customer booking requests.
 *
 *   1. Customer (portal) asks: vehicle, services/packages, preferred dates
 *      (a from–to range), morning/afternoon, a message, and how to reach
 *      them (WhatsApp number and/or email, pre-filled from their account).
 *        → booking PENDING, requestStage REQUESTED, no bay held.
 *   2. Staff (Bookings page) pick the exact start time inside the opening
 *      hours/rules; the job length comes from the catalog. The bay is held
 *      and the customer gets every detail on WhatsApp / email with a link.
 *        → requestStage TIME_PROPOSED.
 *   3. Customer opens the link and confirms (→ ACCEPTED, status CONFIRMED,
 *      job card created as for any confirmed booking) or asks for another
 *      time (→ back to REQUESTED, bay released).
 */
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { createAndSendNotification } from "./notificationService";
import { resolveLineItem, transitionBookingStatus, bookingDurationMinutes, type BookingLineItem } from "./bookingService";
import * as schedule from "./scheduleService";
import { safeCustomerSelect } from "../utils/prismaSelects";

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5180").replace(/\/$/, "");
const SHOP = {
  name: "D & D Auto Spa",
  address: "431/D, Ihala Kosgama, Kosgama",
  phone: "+94 71 969 7014",
};

export type PreferredTime = "MORNING" | "AFTERNOON" | "ANY";
export type ContactVia = "WHATSAPP" | "EMAIL" | "BOTH";

const money = (n: number) => `Rs. ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hours = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
const longDate = (d: Date) =>
  new Date(d.getTime() + schedule.TZ_OFFSET_MINUTES * 60000).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const ampm = (d: Date) => {
  const [h, m] = schedule.fmtTime(d).split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const fullInclude = {
  customer: { select: safeCustomerSelect },
  vehicle: true,
  services: { include: { service: true, package: true } },
} as const;

/** Send to the contact(s) the customer chose. */
async function tellCustomer(
  b: { customerId: string; contactPhone: string | null; contactEmail: string | null; contactVia: string | null },
  subject: string,
  message: string,
  type: "BOOKING_RECEIVED" | "GENERAL" = "GENERAL"
) {
  const via = (b.contactVia as ContactVia) || "WHATSAPP";
  const sent: string[] = [];
  if ((via === "WHATSAPP" || via === "BOTH") && b.contactPhone) {
    const n = await createAndSendNotification({ customerId: b.customerId, type, channel: "WHATSAPP", message, to: b.contactPhone }).catch(() => null);
    if (n?.status === "SENT") sent.push("WhatsApp");
  }
  if ((via === "EMAIL" || via === "BOTH") && b.contactEmail) {
    const n = await createAndSendNotification({ customerId: b.customerId, type, channel: "EMAIL", message, to: b.contactEmail, subject }).catch(() => null);
    if (n?.status === "SENT") sent.push("email");
  }
  return sent;
}

export async function createRequest(input: {
  customerId: string;
  vehicleId: string;
  items: BookingLineItem[];
  preferredFrom: string;
  preferredTo: string;
  preferredTime: PreferredTime;
  message?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactVia: ContactVia;
}) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } });
  if (!vehicle) throw new AppError(404, "Vehicle not found");
  if (vehicle.customerId !== input.customerId) throw new AppError(403, "Vehicle does not belong to this customer");

  const s = await schedule.getScheduleSettings();
  const today = schedule.localDateOf(new Date());
  const lastDay = schedule.localDateOf(new Date(Date.now() + s.maxDaysAhead * 86400000));
  if (input.preferredFrom < today) throw new AppError(400, "The first preferred date can't be in the past");
  if (input.preferredTo < input.preferredFrom) throw new AppError(400, "The last preferred date must be on or after the first");
  if (input.preferredFrom > lastDay) throw new AppError(400, `We take bookings up to ${s.maxDaysAhead} days ahead`);

  const via = input.contactVia;
  if ((via === "WHATSAPP" || via === "BOTH") && !input.contactPhone) throw new AppError(400, "Enter a WhatsApp number");
  if ((via === "EMAIL" || via === "BOTH") && !input.contactEmail) throw new AppError(400, "Enter an email address");

  // At least one preferred day must be open.
  let anyOpen = false;
  for (let d = input.preferredFrom; d <= input.preferredTo && !anyOpen; d = nextDay(d)) anyOpen = schedule.dayHours(s, d).open;
  if (!anyOpen) throw new AppError(400, "We're closed on all of those dates — please choose other days");

  const resolved = await Promise.all(input.items.map((i) => resolveLineItem(i, vehicle.vehicleType)));
  // Placeholder time (start of the first preferred day); requests don't hold a bay.
  const h = schedule.dayHours(s, input.preferredFrom);
  const placeholder = h.open ? h.startAt : new Date(schedule.localMidnight(input.preferredFrom) + 8 * 3600000);

  const booking = await prisma.booking.create({
    data: {
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      scheduledAt: placeholder,
      status: "PENDING",
      requestStage: "REQUESTED",
      preferredFrom: input.preferredFrom,
      preferredTo: input.preferredTo,
      preferredTime: input.preferredTime,
      customerMessage: input.message || null,
      contactPhone: input.contactPhone || null,
      contactEmail: input.contactEmail || null,
      contactVia: via,
      services: { create: resolved.map((r) => ({ serviceId: r.serviceId, packageId: r.packageId, price: r.price })) },
      activityLogs: { create: { fromStatus: "PENDING", toStatus: "PENDING", notes: "Booking requested by the customer" } },
    },
    include: fullInclude,
  });

  const range = input.preferredFrom === input.preferredTo ? shortDay(input.preferredFrom) : `${shortDay(input.preferredFrom)} – ${shortDay(input.preferredTo)}`;
  await tellCustomer(
    booking,
    `${SHOP.name} — booking request received`,
    `Hi ${booking.customer.name}, thank you! We received your booking request for ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber}) — preferred ${range}. ` +
      `We'll send you the exact date and time shortly. — ${SHOP.name}`,
    "BOOKING_RECEIVED"
  );
  return booking;
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/** Staff pick the time: hold the bay and send the customer every detail. */
export async function proposeTime(bookingId: string, start: Date, actor: { userId: string; note?: string | null }) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: fullInclude });
  if (!b) throw new AppError(404, "Booking not found");
  if (b.status !== "PENDING" || (b.requestStage !== "REQUESTED" && b.requestStage !== "TIME_PROPOSED")) {
    throw new AppError(400, "Only booking requests waiting for a time can be given one");
  }
  const minutes = await bookingDurationMinutes(bookingId);
  const bayId = await schedule.claimSlot(start, minutes, { excludeBookingId: bookingId });
  const end = new Date(start.getTime() + minutes * 60000);

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      scheduledAt: start,
      bayId,
      requestStage: "TIME_PROPOSED",
      staffNote: actor.note || null,
      proposedAt: new Date(),
      activityLogs: {
        create: {
          fromStatus: "PENDING",
          toStatus: "PENDING",
          changedByUserId: actor.userId,
          notes: `Time offered to the customer: ${longDate(start)}, ${ampm(start)}–${ampm(end)}${actor.note ? ` — ${actor.note}` : ""}`,
        },
      },
    },
    include: fullInclude,
  });

  const total = updated.services.reduce((sum, x) => sum + Number(x.price), 0);
  const work = updated.services.map((x) => x.package?.name ?? x.service?.name ?? "Service").join(", ");
  const message = [
    `Hi ${updated.customer.name},`,
    `Your ${SHOP.name} booking time is ready. Please confirm it:`,
    ``,
    `Vehicle: ${updated.vehicle.make} ${updated.vehicle.model} (${updated.vehicle.plateNumber})`,
    `Work: ${work}`,
    `Date: ${longDate(start)}`,
    `Time: ${ampm(start)} – about ${ampm(end)} (approx. ${hours(minutes)})`,
    `Estimated price: ${money(total)}`,
    `Place: ${SHOP.address}`,
    ...(actor.note ? [``, `Note from us: ${actor.note}`] : []),
    ``,
    `Confirm your booking here: ${FRONTEND_URL}/portal/bookings/${updated.id}`,
    `(Log in to your account. You can also ask for another time there.)`,
    `Questions? Call ${SHOP.phone}`,
  ].join("\n");
  const sentVia = await tellCustomer(updated, `${SHOP.name} — please confirm your booking time`, message);
  return { booking: updated, sentVia, message };
}

/** Customer confirms the offered time → a normal confirmed booking. */
export async function acceptTime(bookingId: string, customerId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.customerId !== customerId) throw new AppError(404, "Booking not found");
  if (b.status !== "PENDING" || b.requestStage !== "TIME_PROPOSED") throw new AppError(400, "There's no time waiting for your confirmation on this booking");
  if (b.scheduledAt.getTime() < Date.now()) throw new AppError(400, "That time has passed — please ask us for another time");
  // Re-check the held slot is still valid (e.g. hours changed meanwhile).
  const minutes = await bookingDurationMinutes(bookingId);
  const bayId = await schedule.claimSlot(b.scheduledAt, minutes, { excludeBookingId: bookingId });
  await prisma.booking.update({ where: { id: bookingId }, data: { requestStage: "ACCEPTED", bayId } });
  return transitionBookingStatus(bookingId, "CONFIRMED", { userId: null, notes: "Time confirmed by the customer" });
}

/** Customer doesn't like the offered time → back to the request list, bay released. */
export async function askAnotherTime(bookingId: string, customerId: string, message?: string | null) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.customerId !== customerId) throw new AppError(404, "Booking not found");
  if (b.status !== "PENDING" || b.requestStage !== "TIME_PROPOSED") throw new AppError(400, "There's no offered time to change on this booking");
  const offered = `${longDate(b.scheduledAt)} ${ampm(b.scheduledAt)}`;
  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      requestStage: "REQUESTED",
      bayId: null,
      customerMessage: [b.customerMessage, `Asked for another time instead of ${offered}${message ? `: ${message}` : ""}`].filter(Boolean).join("\n"),
      activityLogs: {
        create: { fromStatus: "PENDING", toStatus: "PENDING", notes: `Customer asked for another time (offered ${offered})${message ? ` — ${message}` : ""}` },
      },
    },
    include: fullInclude,
  });
}
