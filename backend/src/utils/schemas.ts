import { z } from "zod";

export const staffRoleEnum = z.enum(["ADMIN", "MANAGER", "TECHNICIAN", "RECEPTIONIST"]);
export const vehicleTypeEnum = z.enum(["SEDAN", "SUV", "HATCHBACK", "VAN", "PICKUP", "OTHER"]);
export const serviceCategoryNameEnum = z.enum(["EXTERIOR", "INTERIOR"]);
export const bayStatusEnum = z.enum(["AVAILABLE", "OCCUPIED", "MAINTENANCE"]);

export const registerStaffSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1).optional(),
  password: z.string().min(8),
  role: staffRoleEnum.optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  address: z.string().optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  address: z.string().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const createVehicleSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  plateNumber: z.string().min(1),
  color: z.string().optional(),
  vehicleType: vehicleTypeEnum,
});

export const updateVehicleSchema = createVehicleSchema.partial();

export const createServiceCategorySchema = z.object({
  name: serviceCategoryNameEnum,
});

export const servicePricingSchema = z.object({
  vehicleType: vehicleTypeEnum,
  price: z.number().nonnegative(),
});

export const createServiceSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive(),
  active: z.boolean().optional(),
  pricing: z.array(servicePricingSchema).min(1),
});

export const updateServiceSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  active: z.boolean().optional(),
  pricing: z.array(servicePricingSchema).optional(),
});

export const createServicePackageSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  discountedPrice: z.number().nonnegative(),
  serviceIds: z.array(z.string().uuid()).min(1),
  active: z.boolean().optional(),
});

export const updateServicePackageSchema = createServicePackageSchema.partial();

export const createBaySchema = z.object({
  name: z.string().min(1),
  status: bayStatusEnum.optional(),
});

export const updateBaySchema = createBaySchema.partial();

export const bookingStatusEnum = z.enum([
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "QUALITY_CHECK",
  "READY",
  "COMPLETED",
  "CANCELLED",
]);

export const inspectionStageEnum = z.enum(["PRE_SERVICE", "POST_SERVICE"]);
export const photoTypeEnum = z.enum(["BEFORE", "AFTER"]);

const bookingLineItemSchema = z
  .object({
    serviceId: z.string().uuid().optional(),
    packageId: z.string().uuid().optional(),
  })
  .refine((v) => (v.serviceId ? !v.packageId : !!v.packageId), {
    message: "Each line item must have exactly one of serviceId or packageId",
  });

export const createBookingSchema = z.object({
  customerId: z.string().uuid().optional(), // required for staff callers, ignored for customer callers
  vehicleId: z.string().uuid(),
  scheduledAt: z.coerce.date(),
  items: z.array(bookingLineItemSchema).min(1),
});

export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  durationMinutes: z.coerce.number().int().positive().optional(),
});

export const transitionBookingStatusSchema = z.object({
  status: bookingStatusEnum,
  notes: z.string().optional(),
});

export const assignBaySchema = z.object({
  bayId: z.string().uuid().nullable(),
});

export const assignTechniciansSchema = z.object({
  technicianIds: z.array(z.string().uuid()).min(1),
});

export const createDamageInspectionSchema = z.object({
  stage: inspectionStageEnum,
  diagramMarkings: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      note: z.string().min(1),
    })
  ),
});

export const jobCardNotesSchema = z.object({
  notes: z.string().optional(),
});

export const paymentMethodEnum = z.enum(["CASH", "CARD", "BANK_TRANSFER"]);
export const paymentStatusEnum = z.enum(["PENDING_VERIFICATION", "VERIFIED", "REJECTED"]);

export const createInvoiceSchema = z.object({
  taxRate: z.number().min(0).max(1).optional(), // fraction, e.g. 0.08 for 8%
  discount: z.number().nonnegative().optional(),
});

export const createPaymentSchema = z.object({
  method: paymentMethodEnum,
  amount: z.coerce.number().positive(),
});

export const verifyPaymentSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
});

export const createInventoryItemSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  quantityInStock: z.number().nonnegative(),
  reorderLevel: z.number().nonnegative(),
  costPerUnit: z.number().nonnegative().optional(),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial();

export const createInventoryUsageSchema = z.object({
  itemId: z.string().uuid(),
  quantityUsed: z.number().positive(),
});

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const notificationTypeEnum = z.enum(["BOOKING_CONFIRMED", "JOB_READY", "PAYMENT_VERIFIED", "GENERAL"]);
export const notificationChannelEnum = z.enum(["SMS", "EMAIL"]);

export const createNotificationSchema = z.object({
  customerId: z.string().uuid(),
  type: notificationTypeEnum,
  message: z.string().min(1),
  channel: notificationChannelEnum,
});

export const createUserSchema = registerStaffSchema.extend({
  hourlyRate: z.number().nonnegative().optional(),
});
export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  role: staffRoleEnum.optional(),
  password: z.string().min(8).optional(),
  hourlyRate: z.number().nonnegative().nullable().optional(),
});
