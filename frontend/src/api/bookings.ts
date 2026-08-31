import { apiClient } from "./client";
import type { AvailabilityResponse, Booking, BookingStatus } from "./types";

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

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<Booking> {
  const { data } = await apiClient.patch<Booking>(`/bookings/${id}/status`, { status });
  return data;
}

export async function assignBay(id: string, bayId: string | null): Promise<Booking> {
  const { data } = await apiClient.patch<Booking>(`/bookings/${id}/assign-bay`, { bayId });
  return data;
}
