import { customerApiClient } from "./client";
import type {
  AvailabilityResponse,
  Booking,
  DamageInspection,
  Invoice,
  PaymentMethod,
  Review,
  Service,
  Vehicle,
  VehicleType,
} from "./types";

// ---- Catalog (read-only for the portal) ----

export async function listActiveServices(): Promise<Service[]> {
  const { data } = await customerApiClient.get<Service[]>("/services", { params: { active: true } });
  return data;
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
  input: { make: string; model: string; year: number; plateNumber: string; color?: string; vehicleType: VehicleType }
): Promise<Vehicle> {
  const { data } = await customerApiClient.post(`/customers/${customerId}/vehicles`, input);
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

export async function createMyBooking(input: {
  vehicleId: string;
  scheduledAt: string;
  items: { serviceId?: string; packageId?: string }[];
}): Promise<Booking> {
  const { data } = await customerApiClient.post("/bookings", input);
  return data;
}

// ---- Damage inspection acknowledgement ----

export async function acknowledgeInspection(inspectionId: string): Promise<DamageInspection> {
  const { data } = await customerApiClient.patch(`/damage-inspections/${inspectionId}/acknowledge`);
  return data;
}

// ---- Invoices / payments ----

export async function getMyInvoice(invoiceId: string): Promise<Invoice> {
  const { data } = await customerApiClient.get(`/invoices/${invoiceId}`);
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
