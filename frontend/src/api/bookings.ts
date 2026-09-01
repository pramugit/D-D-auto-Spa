import { apiClient } from "./client";
import type { AttentionBooking, AvailabilityResponse, Booking, BookingActivityLogEntry, BookingStatus } from "./types";

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

export async function getAvailability(date: string, durationMinutes?: number): Promise<AvailabilityResponse> {
  const { data } = await apiClient.get<AvailabilityResponse>("/bookings/availability", {
    params: { date, durationMinutes },
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
