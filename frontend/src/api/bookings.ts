import { apiClient } from "./client";
import type {
  ScheduleSettings, AttentionBooking, AvailabilityResponse, Booking, BookingActivityLogEntry, BookingStatus } from "./types";

export interface BookingLineItemInput {
  serviceId?: string;
  packageId?: string;
}

export async function listBookings(params?: { status?: BookingStatus; customerId?: string }): Promise<Booking[]> {
  const { data } = await apiClient.get<Booking[]>("/bookings", { params });
  return data;
}

export async function getBooking(id: string): Promise<Booking> {
  const { data } = await apiClient.get<Booking>(`/bookings/${id}`);
  return data;
}

export async function createBooking(input: {
  customerId?: string;
  vehicleId: string;
  scheduledAt: string;
  items: BookingLineItemInput[];
}): Promise<Booking> {
  const { data } = await apiClient.post<Booking>("/bookings", input);
  return data;
}

/** Daily Jobs board's quick-create for a walk-in — no scheduling, goes
 *  straight to CONFIRMED server-side. */
export async function createWalkInJob(input: {
  customerId: string;
  vehicleId: string;
  items: BookingLineItemInput[];
  mileage?: number;
}): Promise<Booking> {
  const { data } = await apiClient.post<Booking>("/bookings/walk-in", input);
  return data;
}

export async function getAvailability(
  date: string,
  durationMinutes?: number,
  excludeBookingId?: string
): Promise<AvailabilityResponse> {
  const { data } = await apiClient.get<AvailabilityResponse>("/bookings/availability", {
    params: { date, durationMinutes, excludeBookingId },
  });
  return data;
}

export async function updateBookingStatus(id: string, status: BookingStatus, notes?: string): Promise<Booking> {
  const { data } = await apiClient.patch<Booking>(`/bookings/${id}/status`, { status, notes });
  return data;
}

export async function assignBay(id: string, bayId: string | null): Promise<Booking> {
  const { data } = await apiClient.patch<Booking>(`/bookings/${id}/assign-bay`, { bayId });
  return data;
}

export async function claimBooking(id: string): Promise<Booking> {
  const { data } = await apiClient.patch<Booking>(`/bookings/${id}/claim`);
  return data;
}

export async function getBookingActivityLog(id: string): Promise<BookingActivityLogEntry[]> {
  const { data } = await apiClient.get<BookingActivityLogEntry[]>(`/bookings/${id}/activity-log`);
  return data;
}

export async function getBookingsNeedingAttention(): Promise<AttentionBooking[]> {
  const { data } = await apiClient.get<AttentionBooking[]>("/bookings/attention");
  return data;
}

// ── Time management ──
export interface ScheduleBooking {
  id: string;
  start: string;
  end: string;
  startLabel: string;
  endLabel: string;
  minutes: number;
  /** Part of `minutes` that comes from damage repairs added at inspection. */
  repairMinutes?: number;
  /** Another booking on the same bay this one now runs into. */
  clashWith?: string | null;
  status: BookingStatus;
  isWalkIn: boolean;
  bayId: string | null;
  customer: { name: string; phone: string };
  vehicle: { plateNumber: string; make: string; model: string };
  jobCardId: string | null;
  services: string[];
  total: number;
}

export interface DaySchedule {
  date: string;
  hours: { open: boolean; reason: string | null; start: string; end: string; startAt?: string; endAt?: string };
  slotMinutes: number;
  bufferMinutes: number;
  bays: { id: string; name: string; status: string }[];
  bookings: ScheduleBooking[];
}

export interface WeekSummary {
  start: string;
  bays: number;
  days: {
    date: string;
    open: boolean;
    closedReason: string | null;
    hours: string | null;
    bookings: number;
    pending: number;
    walkIns: number;
    bookedMinutes: number;
    capacityMinutes: number;
    utilization: number;
  }[];
}

export async function getDaySchedule(date: string): Promise<DaySchedule> {
  const { data } = await apiClient.get<DaySchedule>("/bookings/schedule/day", { params: { date } });
  return data;
}

export async function getWeekSummary(start: string, days = 7): Promise<WeekSummary> {
  const { data } = await apiClient.get<WeekSummary>("/bookings/schedule/week", { params: { start, days } });
  return data;
}

export async function getScheduleSettings(): Promise<ScheduleSettings> {
  const { data } = await apiClient.get<ScheduleSettings>("/bookings/schedule/settings");
  return data;
}

export async function saveScheduleSettings(s: ScheduleSettings): Promise<ScheduleSettings> {
  const { data } = await apiClient.put<ScheduleSettings>("/bookings/schedule/settings", s);
  return data;
}

export async function rescheduleBooking(id: string, scheduledAt: string, notes?: string): Promise<Booking> {
  const { data } = await apiClient.patch<Booking>(`/bookings/${id}/reschedule`, { scheduledAt, notes });
  return data;
}

/** Give a booking request its exact time — holds the bay and sends the customer all details. */
export async function proposeTime(
  bookingId: string,
  scheduledAt: string,
  note?: string
): Promise<{ booking: Booking; sentVia: string[]; message: string }> {
  const { data } = await apiClient.patch(`/bookings/${bookingId}/propose-time`, { scheduledAt, note });
  return data;
}
