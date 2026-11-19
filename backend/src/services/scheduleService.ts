import type { BookingStatus } from "@prisma/client";
import { ITEMS_SELECT, REPAIRS_SELECT, bookingMinutes, repairMinutes } from "./durationService";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

/**
 * Time management for bookings — one engine used by the admin portal and the
 * customer portal alike:
 *   - opening hours per weekday, closed dates (holidays / Poya days)
 *   - slot length, a cleaning buffer between jobs on the same bay
 *   - customer rules: minimum notice, how far ahead, cancel/reschedule window
 *   - capacity = working bays; every booking (and walk-in) occupies a bay
 *     for its services' total duration
 * All times are the station's local time (Sri Lanka, UTC+5:30).
 */

export const TZ_OFFSET_MINUTES = 330;
const DEFAULT_DURATION = 60;

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]; // JS getDay() order

export interface ScheduleSettings {
  hours: Record<Weekday, { open: boolean; start: string; end: string }>;
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number; // customers can't book closer than this
  maxDaysAhead: number; // customers can't book further out than this
  customerChangeHours: number; // customers may cancel/reschedule until this many hours before
  closedDates: { date: string; reason: string }[];
}

const KEY = "schedule-settings";
const DEFAULTS: ScheduleSettings = {
  hours: {
    mon: { open: true, start: "08:00", end: "18:00" },
    tue: { open: true, start: "08:00", end: "18:00" },
    wed: { open: true, start: "08:00", end: "18:00" },
    thu: { open: true, start: "08:00", end: "18:00" },
    fri: { open: true, start: "08:00", end: "18:00" },
    sat: { open: true, start: "08:00", end: "18:00" },
    sun: { open: false, start: "08:00", end: "13:00" },
  },
  slotMinutes: 30,
  bufferMinutes: 15,
  minNoticeHours: 2,
  maxDaysAhead: 30,
  customerChangeHours: 12,
  closedDates: [],
};

export async function getScheduleSettings(): Promise<ScheduleSettings> {
  const row = await prisma.siteContent.findUnique({ where: { key: KEY } });
  const saved = (row?.data as Partial<ScheduleSettings> | null) ?? {};
  return { ...DEFAULTS, ...saved, hours: { ...DEFAULTS.hours, ...(saved.hours ?? {}) } };
}

export async function saveScheduleSettings(next: ScheduleSettings) {
  for (const d of Object.values(next.hours)) {
    if (d.open && d.end <= d.start) throw new AppError(400, "Closing time must be after opening time");
  }
  next.closedDates = [...next.closedDates].sort((a, b) => a.date.localeCompare(b.date));
  await prisma.siteContent.upsert({
    where: { key: KEY },
    update: { data: next as object },
    create: { key: KEY, data: next as object },
  });
  return next;
}

// ── Local-time helpers ──
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
/** UTC ms of local midnight for "YYYY-MM-DD". */
export const localMidnight = (date: string) => Date.parse(`${date}T00:00:00.000Z`) - TZ_OFFSET_MINUTES * 60000;
/** Local "YYYY-MM-DD" of an instant. */
export const localDateOf = (d: Date) => new Date(d.getTime() + TZ_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);
const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
export const fmtTime = (d: Date) => new Date(d.getTime() + TZ_OFFSET_MINUTES * 60000).toISOString().slice(11, 16);

export function dayHours(s: ScheduleSettings, date: string) {
  const closed = s.closedDates.find((c) => c.date === date);
  const h = s.hours[weekdayOf(date)];
  if (closed) return { open: false as const, reason: closed.reason || "Closed (holiday)", start: h.start, end: h.end };
  if (!h.open) return { open: false as const, reason: "Closed on this day of the week", start: h.start, end: h.end };
  const base = localMidnight(date);
  return {
    open: true as const,
    reason: null,
    start: h.start,
    end: h.end,
    startAt: new Date(base + toMin(h.start) * 60000),
    endAt: new Date(base + toMin(h.end) * 60000),
  };
}

// ── Durations / occupancy ── (see durationService)

const OPEN_WORK: BookingStatus[] = ["IN_PROGRESS", "QUALITY_CHECK", "READY"];

/**
 * Everything holding a bay that day: each non-cancelled booking for its
 * estimated duration (+ buffer). Completed jobs free the bay at completion;
 * jobs still being worked on past their estimate keep the bay until now.
 */
export async function occupancy(date: string, excludeBookingId?: string) {
  const s = await getScheduleSettings();
  const from = new Date(localMidnight(date));
  const to = new Date(localMidnight(date) + 86400000);
  const bookings = await prisma.booking.findMany({
    where: {
      status: { not: "CANCELLED" },
      // A request with no time picked yet doesn't hold a bay.
      NOT: { requestStage: "REQUESTED" },
      scheduledAt: { lt: to },
      // A job started yesterday and still open also holds a bay today.
      OR: [{ scheduledAt: { gte: from } }, { status: { in: OPEN_WORK } }],
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: {
      id: true,
      bayId: true,
      scheduledAt: true,
      status: true,
      isWalkIn: true,
      jobCard: { select: { completedAt: true, ...REPAIRS_SELECT } },
      services: { select: ITEMS_SELECT },
    },
  });
  const now = Date.now();
  return bookings.map((b) => {
    const minutes = bookingMinutes(b);
    let end = b.scheduledAt.getTime() + minutes * 60000;
    if (b.status === "COMPLETED" && b.jobCard?.completedAt) end = Math.min(end, b.jobCard.completedAt.getTime());
    if (OPEN_WORK.includes(b.status) && end < now) end = now + s.slotMinutes * 60000;
    return { id: b.id, bayId: b.bayId, start: b.scheduledAt.getTime(), end: end + s.bufferMinutes * 60000, minutes, status: b.status, isWalkIn: b.isWalkIn };
  });
}

async function workingBays() {
  return prisma.bay.findMany({ where: { status: { not: "MAINTENANCE" } }, orderBy: { name: "asc" } });
}

/** Which working bays are free for [start, end)? Unassigned bookings still use up capacity. */
function freeBays(bays: { id: string }[], occ: Awaited<ReturnType<typeof occupancy>>, start: number, end: number) {
  const overlapping = occ.filter((o) => o.start < end && start < o.end);
  const takenIds = new Set(overlapping.map((o) => o.bayId).filter(Boolean) as string[]);
  const unassigned = overlapping.filter((o) => !o.bayId || !bays.some((b) => b.id === o.bayId)).length;
  const free = bays.filter((b) => !takenIds.has(b.id));
  return free.slice(0, Math.max(0, free.length - unassigned));
}

export interface SlotQuery {
  customer?: boolean; // apply customer booking rules
  excludeBookingId?: string; // when rescheduling, ignore the booking itself
}

export async function getAvailability(date: string, durationMinutes?: number, q: SlotQuery = {}) {
  const s = await getScheduleSettings();
  const bays = await workingBays();
  const h = dayHours(s, date);
  const duration = durationMinutes || DEFAULT_DURATION;
  const base = { date, bayCount: bays.length, slotMinutes: s.slotMinutes, durationMinutes: duration, opensAt: h.start, closesAt: h.end };
  if (!h.open) return { ...base, open: false, closedReason: h.reason, slots: [] as Slot[] };
  if (bays.length === 0) return { ...base, open: false, closedReason: "No working bays", slots: [] as Slot[] };

  const now = Date.now();
  const earliest = q.customer ? now + s.minNoticeHours * 3600000 : now;
  const latestDay = localDateOf(new Date(now + s.maxDaysAhead * 86400000));
  if (q.customer && date > latestDay) {
    return { ...base, open: false, closedReason: `Bookings open up to ${s.maxDaysAhead} days ahead`, slots: [] as Slot[] };
  }

  const occ = await occupancy(date, q.excludeBookingId);
  const slots: Slot[] = [];
  for (let t = h.startAt.getTime(); t + duration * 60000 <= h.endAt.getTime(); t += s.slotMinutes * 60000) {
    const end = t + duration * 60000;
    const free = freeBays(bays, occ, t, end + s.bufferMinutes * 60000);
    let reason: string | undefined;
    if (t < now) reason = "past";
    else if (t < earliest) reason = "too soon";
    else if (free.length === 0) reason = "full";
    slots.push({ time: new Date(t).toISOString(), available: !reason, freeBays: reason ? 0 : free.length, reason });
  }
  return { ...base, open: true, closedReason: null, slots };
}
export type Slot = { time: string; available: boolean; freeBays: number; reason?: string };

/**
 * Server-side check before saving a booking time. Returns the bay to use;
 * throws a friendly 409 if the time no longer works.
 */
export async function claimSlot(start: Date, durationMinutes: number, q: SlotQuery = {}) {
  const s = await getScheduleSettings();
  const date = localDateOf(start);
  const h = dayHours(s, date);
  if (!h.open) throw new AppError(409, `We're closed then: ${h.reason}.`);
  const end = start.getTime() + durationMinutes * 60000;
  if (start < h.startAt || end > h.endAt.getTime()) {
    throw new AppError(409, `That doesn't fit our hours on ${date} (${h.start}–${h.end}) — the work takes about ${Math.round(durationMinutes / 6) / 10} h.`);
  }
  if (start.getTime() < Date.now()) throw new AppError(409, "That time has already passed.");
  if (q.customer) {
    if (start.getTime() < Date.now() + s.minNoticeHours * 3600000) throw new AppError(409, `Please book at least ${s.minNoticeHours} hour(s) ahead.`);
    if (date > localDateOf(new Date(Date.now() + s.maxDaysAhead * 86400000))) throw new AppError(409, `Bookings open up to ${s.maxDaysAhead} days ahead.`);
  }
  const bays = await workingBays();
  const occ = await occupancy(date, q.excludeBookingId);
  const free = freeBays(bays, occ, start.getTime(), end + s.bufferMinutes * 60000);
  if (free.length === 0) throw new AppError(409, "Sorry — that time was just taken. Please pick another slot.");
  return free[0].id;
}

/** Bay for a walk-in starting now (null if every bay is busy — it still goes ahead). */
export async function bayForWalkIn(durationMinutes: number) {
  const now = new Date();
  const bays = await workingBays();
  const occ = await occupancy(localDateOf(now));
  return freeBays(bays, occ, now.getTime(), now.getTime() + durationMinutes * 60000)[0]?.id ?? null;
}

// ── Admin schedule views ──
export async function daySchedule(date: string) {
  const s = await getScheduleSettings();
  const h = dayHours(s, date);
  const bays = await prisma.bay.findMany({ orderBy: { name: "asc" } });
  const from = new Date(localMidnight(date));
  const to = new Date(localMidnight(date) + 86400000);
  const bookings = await prisma.booking.findMany({
    where: { scheduledAt: { gte: from, lt: to }, NOT: { requestStage: "REQUESTED" } },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      scheduledAt: true,
      status: true,
      isWalkIn: true,
      bayId: true,
      customer: { select: { name: true, phone: true } },
      vehicle: { select: { plateNumber: true, make: true, model: true } },
      jobCard: { select: { id: true, completedAt: true, ...REPAIRS_SELECT } },
      services: {
        select: {
          price: true,
          service: { select: { name: true, durationMinutes: true } },
          package: { select: { name: true, durationMinutes: true, services: { select: { service: { select: { durationMinutes: true } } } } } },
        },
      },
    },
  });
  return {
    date,
    hours: h,
    slotMinutes: s.slotMinutes,
    bufferMinutes: s.bufferMinutes,
    bays: bays.map((b) => ({ id: b.id, name: b.name, status: b.status })),
    bookings: withClashes(bookings.map((b) => {
      const minutes = bookingMinutes(b);
      const repairs = repairMinutes(b.jobCard);
      return {
        id: b.id,
        start: b.scheduledAt.toISOString(),
        end: new Date(b.scheduledAt.getTime() + minutes * 60000).toISOString(),
        startLabel: fmtTime(b.scheduledAt),
        endLabel: fmtTime(new Date(b.scheduledAt.getTime() + minutes * 60000)),
        minutes,
        repairMinutes: repairs,
        status: b.status,
        isWalkIn: b.isWalkIn,
        bayId: b.bayId,
        customer: b.customer,
        vehicle: b.vehicle,
        jobCardId: b.jobCard?.id ?? null,
        services: b.services.map((x) => x.package?.name ?? x.service?.name ?? "Service"),
        total: b.services.reduce((sum, x) => sum + Number(x.price), 0),
      };
    }), s.bufferMinutes),
  };
}

/** Marks bookings that overlap another open booking on the same bay (e.g. after repairs were added). */
function withClashes<T extends { id: string; bayId: string | null; start: string; end: string; status: BookingStatus }>(list: T[], bufferMinutes: number) {
  const live = list.filter((b) => b.status !== "CANCELLED" && b.status !== "COMPLETED" && b.bayId);
  return list.map((b) => {
    if (!live.includes(b)) return { ...b, clashWith: null as string | null };
    const s = Date.parse(b.start), e = Date.parse(b.end) + bufferMinutes * 60000;
    const other = live.find((o) => o.id !== b.id && o.bayId === b.bayId && Date.parse(o.start) < e && s < Date.parse(o.end) + bufferMinutes * 60000);
    return { ...b, clashWith: other ? other.id : null };
  });
}

export async function weekSummary(startDate: string, days = 7) {
  const s = await getScheduleSettings();
  const bays = await workingBays();
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.parse(`${startDate}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
    const h = dayHours(s, date);
    const occ = h.open ? await occupancy(date) : [];
    const dayOcc = occ.filter((o) => localDateOf(new Date(o.start)) === date);
    const capacity = h.open ? ((toMin(h.end) - toMin(h.start)) * bays.length) : 0;
    const booked = dayOcc.reduce((sum, o) => sum + o.minutes, 0);
    out.push({
      date,
      open: h.open,
      closedReason: h.open ? null : h.reason,
      hours: h.open ? `${h.start}–${h.end}` : null,
      bookings: dayOcc.length,
      pending: dayOcc.filter((o) => o.status === "PENDING").length,
      walkIns: dayOcc.filter((o) => o.isWalkIn).length,
      bookedMinutes: booked,
      capacityMinutes: capacity,
      utilization: capacity ? Math.min(100, Math.round((booked / capacity) * 100)) : 0,
    });
  }
  return { start: startDate, bays: bays.length, days: out };
}
