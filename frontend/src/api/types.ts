export type StaffRole = "ADMIN" | "MANAGER" | "TECHNICIAN" | "RECEPTIONIST";
export type VehicleType = "SEDAN" | "SUV" | "HATCHBACK" | "VAN" | "PICKUP" | "OTHER";
export type ServiceCategoryName = "EXTERIOR" | "INTERIOR";
export type BayStatus = "AVAILABLE" | "OCCUPIED" | "MAINTENANCE";
export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "QUALITY_CHECK"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";
export type InspectionStage = "PRE_SERVICE" | "POST_SERVICE";
export type PhotoType = "BEFORE" | "AFTER";
export type InvoiceStatus = "UNPAID" | "PAID" | "PARTIALLY_PAID";
export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER";
export type PaymentStatus = "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED";
export type NotificationType = "BOOKING_CONFIRMED" | "JOB_READY" | "PAYMENT_VERIFIED" | "GENERAL";
export type NotificationChannel = "SMS" | "EMAIL";
export type NotificationStatus = "PENDING" | "SENT";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: StaffRole;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  loyaltyPoints: number;
  createdAt: string;
  vehicles?: Vehicle[];
}

export interface Vehicle {
  id: string;
  customerId: string;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  color?: string | null;
  vehicleType: VehicleType;
}

export interface ServiceCategory {
  id: string;
  name: ServiceCategoryName;
  services?: Service[];
}

export interface ServicePricing {
  id: string;
  serviceId: string;
  vehicleType: VehicleType;
  price: string;
}

export interface Service {
  id: string;
  categoryId: string;
  category?: ServiceCategory;
  name: string;
  description?: string | null;
  durationMinutes: number;
  active: boolean;
  pricing: ServicePricing[];
}

export interface ServicePackageServiceLink {
  packageId: string;
  serviceId: string;
  service: Service;
}

export interface ServicePackage {
  id: string;
  name: string;
  description?: string | null;
  discountedPrice: string;
  active: boolean;
  services: ServicePackageServiceLink[];
}

export interface Bay {
  id: string;
  name: string;
  status: BayStatus;
}

export interface BookingServiceItem {
  id: string;
  bookingId: string;
  serviceId?: string | null;
  packageId?: string | null;
  price: string;
  service?: Service | null;
  package?: ServicePackage | null;
}

export interface Booking {
  id: string;
  customerId: string;
  vehicleId: string;
  scheduledAt: string;
  bayId?: string | null;
  bay?: Bay | null;
  status: BookingStatus;
  createdAt: string;
  customer?: Customer;
  vehicle?: Vehicle;
  services?: BookingServiceItem[];
  jobCard?: JobCard | null;
}

export interface DamageMarking {
  x: number;
  y: number;
  note: string;
}

export interface DamageInspection {
  id: string;
  jobCardId: string;
  stage: InspectionStage;
  diagramMarkings: DamageMarking[];
  inspectedByUserId: string;
  customerAcknowledged: boolean;
  acknowledgedAt?: string | null;
  createdAt: string;
}

export interface Photo {
  id: string;
  jobCardId: string;
  type: PhotoType;
  url: string;
  uploadedAt: string;
}

export interface JobCardTechnicianLink {
  jobCardId: string;
  userId: string;
  user: { id: string; name: string; email: string; role: StaffRole };
}

export interface Invoice {
  id: string;
  jobCardId: string;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  status: InvoiceStatus;
  createdAt: string;
  payments?: Payment[];
  jobCard?: JobCard;
}

export interface Payment {
  id: string;
  invoiceId: string;
  method: PaymentMethod;
  amount: string;
  slipUrl?: string | null;
  status: PaymentStatus;
  verifiedByUserId?: string | null;
  createdAt: string;
}

export interface JobCard {
  id: string;
  bookingId: string;
  startedAt?: string | null;
  completedAt?: string | null;
  status: BookingStatus;
  notes?: string | null;
  booking: Booking;
  technicians: JobCardTechnicianLink[];
  damageInspections: DamageInspection[];
  photos: Photo[];
  invoice?: Invoice | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantityInStock: string;
  reorderLevel: string;
}

export interface Review {
  id: string;
  jobCardId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  customerId: string;
  type: NotificationType;
  message: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  createdAt: string;
}

export interface AvailabilitySlot {
  time: string;
  available: boolean;
}

export interface AvailabilityResponse {
  date: string;
  bayCount: number;
  slots: AvailabilitySlot[];
}
