import { customerApiClient } from "./client";
import type {
  ScheduleSettings,
  AvailabilityResponse,
  BankAccount,
  Booking,
  BookingActivityLogEntry,
  DamageInspection,
  DamageMarking,
  Invoice,
  PaymentMethod,
  Review,
  Service,
  ServicePackage,
  Vehicle,
  VehicleType,
} from "./types";

// ---- Catalog (read-only for the portal) ----

export async function listActiveServices(): Promise<Service[]> {
  const { data } = await customerApiClient.get<Service[]>("/services", { params: { active: true } });
  return data;
}

export async function listActivePackages(): Promise<ServicePackage[]> {
  const { data } = await customerApiClient.get<ServicePackage[]>("/service-packages");
  return data.filter((p) => p.active);
}

export interface CustomerSummary {
  id: string;
  name: string;
  email: string;
  loyaltyPoints: number;
}

export interface PortalCustomer {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  loyaltyPoints: number;
  createdAt: string;
  vehicles: Vehicle[];
}

// ---- Auth ----

export async function registerCustomer(input: {
  name: string;
  phone: string;
  email: string;
  password: string;
  address?: string;
}): Promise<{ token: string; customer: CustomerSummary }> {
  const { data } = await customerApiClient.post("/customer-auth/register", input);
  return data;
}

export async function loginCustomer(email: string, password: string): Promise<{ token: string; customer: CustomerSummary }> {
  const { data } = await customerApiClient.post("/customer-auth/login", { email, password });
  return data;
}

export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
  await customerApiClient.patch("/customer-auth/change-password", { currentPassword, newPassword });
}

// ---- Profile / vehicles ----

export async function getMyProfile(customerId: string): Promise<PortalCustomer> {
  const { data } = await customerApiClient.get(`/customers/${customerId}`);
  return data;
}

export async function listMyVehicles(customerId: string): Promise<Vehicle[]> {
  const { data } = await customerApiClient.get(`/customers/${customerId}/vehicles`);
  return data;
}

export async function addMyVehicle(
  customerId: string,
  input: { make: string; model: string; year: number; plateNumber: string; color?: string; vehicleType: VehicleType; mileage?: number | null }
): Promise<Vehicle> {
  const { data } = await customerApiClient.post(`/customers/${customerId}/vehicles`, input);
  return data;
}

export async function updateMyVehicle(
  customerId: string,
  vehicleId: string,
  input: Partial<{ make: string; model: string; year: number; plateNumber: string; color: string; vehicleType: VehicleType; mileage: number | null }>
): Promise<Vehicle> {
  const { data } = await customerApiClient.patch(`/customers/${customerId}/vehicles/${vehicleId}`, input);
  return data;
}

export async function removeMyVehicle(customerId: string, vehicleId: string): Promise<void> {
  await customerApiClient.delete(`/customers/${customerId}/vehicles/${vehicleId}`);
}

export async function updateMyProfile(
  customerId: string,
  input: Partial<{ name: string; phone: string; email: string; address: string }>
): Promise<PortalCustomer> {
  const { data } = await customerApiClient.patch(`/customers/${customerId}`, input);
  return data;
}

export async function getMyLoyalty(customerId: string): Promise<CustomerSummary> {
  const { data } = await customerApiClient.get(`/customers/${customerId}/loyalty`);
  return data;
}

// ---- Bookings ----

export async function getAvailability(date: string, durationMinutes?: number): Promise<AvailabilityResponse> {
  const { data } = await customerApiClient.get("/bookings/availability", { params: { date, durationMinutes } });
  return data;
}

export async function listMyBookings(): Promise<Booking[]> {
  const { data } = await customerApiClient.get("/bookings");
  return data;
}

export async function getMyBooking(id: string): Promise<Booking> {
  const { data } = await customerApiClient.get(`/bookings/${id}`);
  return data;
}

/** Same "/bookings/:id/activity-log" endpoint the staff app uses — the
 *  route already checks booking.customerId against a customer token
 *  (see bookingController.activityLog), it just needs to be called with
 *  the customer-authenticated client instead of the staff one. */
export async function getMyBookingActivityLog(id: string): Promise<BookingActivityLogEntry[]> {
  const { data } = await customerApiClient.get<BookingActivityLogEntry[]>(`/bookings/${id}/activity-log`);
  return data;
}

export async function createMyBooking(input: {
  vehicleId: string;
  scheduledAt: string;
  items: { serviceId?: string; packageId?: string }[];
}): Promise<Booking> {
  const { data } = await customerApiClient.post("/bookings", input);
  return data;
}

export async function cancelMyBooking(bookingId: string): Promise<Booking> {
  const { data } = await customerApiClient.patch(`/bookings/${bookingId}/cancel`);
  return data;
}

// ---- Damage inspection acknowledgement ----

export async function acknowledgeInspection(inspectionId: string): Promise<DamageInspection> {
  const { data } = await customerApiClient.patch(`/damage-inspections/${inspectionId}/acknowledge`);
  return data;
}

/** The customer's binary decision on a single additional-repair offer —
 *  approve it (billed on the eventual invoice) or decline it. Locks
 *  after this: the backend rejects a second decision on the same
 *  marking (see damageMarkingController.decide). */
export async function decideDamageMarking(markingId: string, approved: boolean): Promise<DamageMarking> {
  const { data } = await customerApiClient.patch(`/damage-markings/${markingId}/customer-decision`, { approved });
  return data;
}

// ---- Invoices / payments ----

export async function getMyInvoice(invoiceId: string): Promise<Invoice> {
  const { data } = await customerApiClient.get(`/invoices/${invoiceId}`);
  return data;
}

export async function listActiveBankAccounts(): Promise<BankAccount[]> {
  const { data } = await customerApiClient.get<BankAccount[]>("/bank-accounts");
  return data;
}

export async function submitMyPayment(invoiceId: string, method: PaymentMethod, amount: number, slip?: File | null) {
  const form = new FormData();
  form.append("method", method);
  form.append("amount", String(amount));
  if (slip) form.append("slip", slip);
  const { data } = await customerApiClient.post(`/invoices/${invoiceId}/payments`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// ---- Reviews ----

export async function submitMyReview(jobCardId: string, rating: number, comment?: string): Promise<Review> {
  const { data } = await customerApiClient.post(`/job-cards/${jobCardId}/review`, { rating, comment });
  return data;
}

/** Opening hours + booking rules, for the booking page and change window. */
export async function getScheduleRules(): Promise<ScheduleSettings> {
  const { data } = await customerApiClient.get<ScheduleSettings>("/bookings/schedule/settings");
  return data;
}

export async function getAvailabilityFor(date: string, durationMinutes?: number, excludeBookingId?: string): Promise<AvailabilityResponse> {
  const { data } = await customerApiClient.get<AvailabilityResponse>("/bookings/availability", {
    params: { date, durationMinutes, excludeBookingId },
  });
  return data;
}

export async function rescheduleMyBooking(bookingId: string, scheduledAt: string): Promise<Booking> {
  const { data } = await customerApiClient.patch<Booking>(`/bookings/${bookingId}/reschedule`, { scheduledAt });
  return data;
}

// ---- Booking requests ----
export async function requestBooking(input: {
  vehicleId: string;
  items: { serviceId?: string; packageId?: string }[];
  preferredFrom: string;
  preferredTo: string;
  preferredTime: "MORNING" | "AFTERNOON" | "ANY";
  message?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactVia: "WHATSAPP" | "EMAIL" | "BOTH";
}): Promise<Booking> {
  const { data } = await customerApiClient.post("/bookings/request", input);
  return data;
}

export async function acceptBookingTime(bookingId: string): Promise<Booking> {
  const { data } = await customerApiClient.post(`/bookings/${bookingId}/accept-time`);
  return data;
}

export async function askAnotherTime(bookingId: string, message?: string): Promise<Booking> {
  const { data } = await customerApiClient.post(`/bookings/${bookingId}/ask-another-time`, { message });
  return data;
}
