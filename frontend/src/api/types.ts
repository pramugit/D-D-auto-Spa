export type StaffRole = "ADMIN" | "MANAGER" | "TECHNICIAN" | "RECEPTIONIST";
// Renamed from VehicleView (LEFT/RIGHT -> LEFT_SIDE/RIGHT_SIDE). The
// per-marking view is no longer user-selectable (see
// components/DamageInspectionDiagram.tsx, which now shows one photo per
// category rather than 4 view-specific diagrams) but the column is still
// NOT NULL, so new markings are always saved as FRONT.
export type DiagramView = "FRONT" | "REAR" | "LEFT_SIDE" | "RIGHT_SIDE";
export type VehicleType =
  | "SEDAN"
  | "HATCHBACK"
  | "SUV"
  | "VAN"
  | "JEEP"
  | "CAB"
  | "LORRY"
  | "SEVEN_SEATER"
  | "BUS"
  | "THREE_WHEELER"
  | "MOTORBIKE";
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
export type PhotoType = "BEFORE" | "AFTER" | "PROGRESS";
export type InvoiceStatus = "UNPAID" | "PAID" | "PARTIALLY_PAID";
export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "QR";
export type PaymentStatus = "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED";
export type NotificationType =
  | "BOOKING_CONFIRMED"
  | "JOB_STARTED"
  | "JOB_READY"
  | "JOB_COMPLETED"
  | "BOOKING_CANCELLED"
  | "PAYMENT_VERIFIED"
  | "GENERAL";
export type NotificationChannel = "SMS" | "EMAIL" | "WHATSAPP";
export type NotificationStatus = "PENDING" | "SENT";
export type JobNotificationType =
  | "PHOTOS_UPLOADED"
  | "PHOTOS_SENT"
  | "PHOTOS_OVERDUE"
  | "DAMAGE_MARKING_DECIDED"
  | "INSPECTION_CONFIRMED";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: StaffRole;
  hourlyRate?: string | null;
  monthlySalary?: string | null;
  createdAt: string;
  active?: boolean;
  employeeCode?: string | null;
  joinedAt?: string | null;
  nic?: string | null;
  address?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  shiftStart?: string;
  shiftEnd?: string;
  epfMember?: boolean;
  epfNumber?: string | null;
}

export interface WebAuthnCredentialInfo {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  user?: { id: string; name: string; role: StaffRole };
  clockIn: string;
  clockOut?: string | null;
  createdAt: string;
}

export type SalaryPaymentStatus = "PENDING" | "PAID";

export interface SalaryPayment {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string;
    role: StaffRole;
    employeeCode?: string | null;
    bankName?: string | null;
    bankAccount?: string | null;
    shiftStart?: string;
    shiftEnd?: string;
    nic?: string | null;
    epfNumber?: string | null;
    epfMember?: boolean;
  };
  month: string;
  baseSalary: string;
  epfBase: string;
  epfEmployee: string;
  epfEmployer: string;
  etfEmployer: string;
  workingDays: number;
  daysPresent: number;
  lateDays: number;
  paidLeaveDays: string;
  unpaidDays: string;
  hoursWorked: string;
  overtimeHours: string;
  overtimePay: string;
  absenceDeduction: string;
  bonus: string;
  otherDeductions: string;
  note?: string | null;
  netPay: string;
  status: SalaryPaymentStatus;
  paidAt?: string | null;
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
  /** Latest odometer reading (km). */
  mileage?: number | null;
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
  /** Minutes for the whole package; null = its services added up. */
  durationMinutes?: number | null;
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

export type BookingRequestStage = "REQUESTED" | "TIME_PROPOSED" | "ACCEPTED";

export interface Booking {
  /** Single-booking endpoint only: services + packages + damage repairs. */
  estimatedMinutes?: number;
  /** Customer booking request flow (null for staff-made bookings / walk-ins). */
  requestStage?: BookingRequestStage | null;
  preferredFrom?: string | null;
  preferredTo?: string | null;
  preferredTime?: "MORNING" | "AFTERNOON" | "ANY" | null;
  customerMessage?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactVia?: "WHATSAPP" | "EMAIL" | "BOTH" | null;
  staffNote?: string | null;
  proposedAt?: string | null;
  /** Odometer reading (km) when the vehicle came in. */
  mileage?: number | null;
  id: string;
  customerId: string;
  vehicleId: string;
  scheduledAt: string;
  bayId?: string | null;
  bay?: Bay | null;
  status: BookingStatus;
  createdAt: string;
  isWalkIn?: boolean;
  currentOwnerUserId?: string | null;
  currentOwnerRole?: StaffRole | null;
  currentOwner?: { id: string; name: string; email: string; role: StaffRole } | null;
  customer?: Customer;
  vehicle?: Vehicle;
  services?: BookingServiceItem[];
  // The /bookings endpoints nest a lighter job-card shape (no `booking`
  // or `technicians`, to avoid re-embedding); the full JobCard type below
  // is what /job-cards (staff) returns.
  jobCard?: BookingJobCardSummary | null;
  /** /job-cards only: the latest status change (when the job entered its current stage). */
  activityLogs?: { toStatus: BookingStatus; createdAt: string }[];
}

export interface BookingActivityLogEntry {
  id: string;
  bookingId: string;
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  changedByUserId?: string | null;
  changedByUser?: { id: string; name: string; role: StaffRole } | null;
  notes?: string | null;
  createdAt: string;
}

export interface AttentionBooking {
  id: string;
  status: BookingStatus;
  jobCardId: string | null;
  currentOwnerRole: StaffRole | null;
  currentOwnerUserId: string | null;
  statusEnteredAt: string;
  minutesInStatus: number;
  slaMinutes: number | null;
  slaBreached: boolean;
  unassigned: boolean;
  isWalkIn: boolean;
  customer: { id: string; name: string };
  vehicle: { id: string; plateNumber: string; make: string; model: string };
}

export interface ProfitBreakdown {
  jobCardId: string;
  revenue: number;
  materialCost: number;
  laborCost: number;
  profit: number;
}

export interface BookingJobCardSummary {
  id: string;
  bookingId: string;
  startedAt?: string | null;
  completedAt?: string | null;
  status: BookingStatus;
  notes?: string | null;
  damageInspections: DamageInspection[];
  photos: Photo[];
  invoice?: Invoice | null;
  review?: Review | null;
  /** Who's working on the car — the one relation this otherwise-lighter
   *  shape does carry, since it's genuinely customer-relevant.
   *  JobCardTechnician is a plain join row (composite key, no own id). */
  technicians?: { userId: string; user: { id: string; name: string; role: StaffRole } }[];
}

export type DamageApprovalStatus = "NOT_APPLICABLE" | "PENDING" | "APPROVED" | "DECLINED";

export interface DamageType {
  id: string;
  name: string;
  defaultPrice: string;
  /** Minutes to repair one marked spot. */
  repairMinutes: number;
  category: ServiceCategoryName;
  createdAt: string;
}

export type DamageSeverity = "MINOR" | "MODERATE" | "SEVERE";

export interface DamageMarking {
  id: string;
  damageInspectionId: string;
  /** Named part from an earlier fixed-checklist experiment — superseded
   *  by the 4-view diagram system; present only on markings created
   *  while that was active. */
  zone?: string | null;
  /** Always FRONT for new markings — vestigial since the move off the
   *  4-view diagram system. Null only for the handful of zone-only
   *  markings from the checklist experiment above; a non-FRONT value can
   *  still appear on markings saved before that change. */
  view?: DiagramView | null;
  /** A point on the vehicle's 3D model surface, in that model's local
   *  object space (see config/vehicleModels.ts). Markings saved before
   *  the 3D viewer (photo or SVG-diagram eras) have x/y as 0-100 percent
   *  coordinates instead and no z — handled as a fallback at render time. */
  x?: number | null;
  y?: number | null;
  z?: number | null;
  damageTypeId?: string | null;
  damageType?: DamageType | null;
  note?: string | null;
  /** Repair cost for this spot — only meaningful when isAdditionalRepairOffer
   *  is true; null/undefined for plain documentation markings. */
  suggestedPrice?: string | null;
  /** false: ordinary pre-existing-damage documentation — unbillable,
   *  approvalStatus stays NOT_APPLICABLE, no customer decision needed.
   *  true: a billable extra the customer must approve or decline. */
  isAdditionalRepairOffer: boolean;
  approvalStatus: DamageApprovalStatus;
  /** How bad it looks, set by whoever placed the marker — independent of
   *  approvalStatus (the billing decision). Defaults to MINOR. */
  severity: DamageSeverity;
  /** A close-up of this specific spot, uploaded at marking time. */
  photoUrl?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  /** Extra work found mid-job (flow step 8) — no point on the 3D model. */
  foundDuringWork?: boolean;
}

export interface DamageInspection {
  id: string;
  jobCardId: string;
  stage: InspectionStage;
  markings: DamageMarking[];
  inspectedByUserId: string;
  inspectedByUser?: { id: string; name: string; email: string; role: StaffRole } | null;
  customerAcknowledged: boolean;
  acknowledgedAt?: string | null;
  /** "CUSTOMER_LINK" | "CUSTOMER_PORTAL" | "STAFF_IN_PERSON" */
  acknowledgedVia?: string | null;
  approvalToken?: string | null;
  sentToCustomerAt?: string | null;
  customerComment?: string | null;
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
  invoiceNumber: number;
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

export interface JobEstimate {
  totalMinutes: number;
  serviceMinutes: number;
  repairMinutes: number;
  startsAt: string;
  finishBy: string;
}

export interface JobCard {
  id: string;
  bookingId: string;
  /** Only on the single job card endpoint. */
  estimate?: JobEstimate | null;
  startedAt?: string | null;
  completedAt?: string | null;
  status: BookingStatus;
  notes?: string | null;
  booking: Booking;
  technicians: JobCardTechnicianLink[];
  damageInspections: DamageInspection[];
  photos: Photo[];
  invoice?: Invoice | null;
  review?: Review | null;
  inventoryUsages?: InventoryUsage[];
  consumablesDeductedAt?: string | null;
  // Booked-job flow (job card page)
  bayCheckedInAt?: string | null;
  cooldownStartedAt?: string | null;
  cooldownMinutes?: number | null;
  cooldownDoneAt?: string | null;
  customerWaiting?: "LOUNGE" | "LEAVE" | null;
  promisedReadyAt?: string | null;
  timingSentAt?: string | null;
}

export type InventorySourceType = "INTERNAL_STOCK" | "EXTERNAL_PURCHASE";

export interface InventoryUsage {
  id: string;
  jobCardId: string;
  itemId?: string | null;
  item?: InventoryItem | null;
  quantityUsed: string;
  sourceType: InventorySourceType;
  externalName?: string | null;
  externalCost?: string | null;
  externalVendorNote?: string | null;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantityInStock: string;
  reorderLevel: string;
  costPerUnit: string;
  category?: string | null;
  supplierName?: string | null;
  supplierPhone?: string | null;
  reorderQuantity?: string | null;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface JobNotification {
  id: string;
  jobCardId: string;
  type: JobNotificationType;
  message: string;
  statusAtEvent: BookingStatus;
  technicianId?: string | null;
  technician?: { id: string; name: string } | null;
  createdAt: string;
  jobCard: {
    id: string;
    status: BookingStatus;
    booking: {
      id: string;
      vehicle: { plateNumber: string; make: string; model: string };
      customer: { name: string };
    };
  };
}

export interface AvailabilitySlot {
  time: string;
  available: boolean;
  /** Bays still free at this time (0 when unavailable). */
  freeBays?: number;
  /** Why it's unavailable: "past" | "too soon" | "full". */
  reason?: string;
}

export interface AvailabilityResponse {
  date: string;
  bayCount: number;
  open?: boolean;
  closedReason?: string | null;
  opensAt?: string;
  closesAt?: string;
  slotMinutes?: number;
  durationMinutes?: number;
  slots: AvailabilitySlot[];
}

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** Opening hours + booking rules (Bookings → Hours & rules). */
export interface ScheduleSettings {
  hours: Record<Weekday, { open: boolean; start: string; end: string }>;
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  customerChangeHours: number;
  closedDates: { date: string; reason: string }[];
}
