import { z } from "zod";
import {
  durationMinutesField,
  emailField,
  isoDateTimeField,
  nameField,
  optionalEmailField,
  phoneField,
  plateNumberField,
  positiveNumberField,
  priceField,
} from "./validators";

export const staffRoleEnum = z.enum(["ADMIN", "MANAGER", "TECHNICIAN", "RECEPTIONIST"]);
export const vehicleTypeEnum = z.enum(["SEDAN", "SUV", "HATCHBACK", "VAN", "PICKUP", "OTHER"]);
export const serviceCategoryNameEnum = z.enum(["EXTERIOR", "INTERIOR"]);
export const bayStatusEnum = z.enum(["AVAILABLE", "OCCUPIED", "MAINTENANCE"]);

export const registerStaffSchema = z.object({
  name: nameField(),
  email: emailField(),
  phone: phoneField().optional(),
  password: z.string().min(8),
  role: staffRoleEnum.optional(),
});

export const loginSchema = z.object({
  email: emailField(),
  password: z.string().min(1),
});

export const registerCustomerSchema = z.object({
  name: nameField(),
  phone: phoneField(),
  email: emailField(),
  password: z.string().min(8),
  address: z.string().optional(),
});

export const createCustomerSchema = z.object({
  name: nameField(),
  phone: phoneField(),
  email: optionalEmailField(),
  address: z.string().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const createVehicleSchema = z.object({
  make: nameField(),
  model: nameField(),
  year: z.number().int().min(1900).max(2100),
  plateNumber: plateNumberField(),
  color: z.string().optional(),
  vehicleType: vehicleTypeEnum,
});

export const updateVehicleSchema = createVehicleSchema.partial();

export const createServiceCategorySchema = z.object({
  name: serviceCategoryNameEnum,
});

// Service/package names are product names, not person/vehicle names —
// deliberately NOT run through nameField() (which would reject "Seat &
// Carpet Shampoo"-style names containing "&" or digits). Phase E's name-
// formatting rule is scoped to customer name, staff name, and vehicle
// make/model only.
export const servicePricingSchema = z.object({
  vehicleType: vehicleTypeEnum,
  price: priceField(),
});

export const createServiceSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  durationMinutes: durationMinutesField(),
  active: z.boolean().optional(),
  pricing: z.array(servicePricingSchema).min(1),
});

export const updateServiceSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  durationMinutes: durationMinutesField().optional(),
  active: z.boolean().optional(),
  pricing: z.array(servicePricingSchema).optional(),
});

export const createServicePackageSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  discountedPrice: priceField(),
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
  scheduledAt: isoDateTimeField(),
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
  discount: priceField().optional(),
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
  quantityInStock: priceField(),
  reorderLevel: priceField(),
  costPerUnit: priceField().optional(),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial();

export const createInventoryUsageSchema = z.object({
  itemId: z.string().uuid(),
  quantityUsed: positiveNumberField(),
});

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const notificationTypeEnum = z.enum([
  "BOOKING_CONFIRMED",
  "JOB_STARTED",
  "JOB_READY",
  "JOB_COMPLETED",
  "BOOKING_CANCELLED",
  "PAYMENT_VERIFIED",
  "GENERAL",
]);
export const notificationChannelEnum = z.enum(["SMS", "EMAIL", "WHATSAPP"]);

export const createNotificationSchema = z.object({
  customerId: z.string().uuid(),
  type: notificationTypeEnum,
  message: z.string().min(1),
  channel: notificationChannelEnum,
});

export const createUserSchema = registerStaffSchema.extend({
  hourlyRate: priceField().optional(),
});
export const updateUserSchema = z.object({
  name: nameField().optional(),
  email: emailField().optional(),
  phone: phoneField().optional(),
  role: staffRoleEnum.optional(),
  password: z.string().min(8).optional(),
  hourlyRate: priceField().nullable().optional(),
});

const heroSlideSchema = z.object({
  eyebrow: z.string().min(1),
  headlineA: z.string().min(1),
  headlineB: z.string().min(1),
  headlineC: z.string().min(1),
  body: z.string().min(1),
});

const featureCardSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  dark: z.boolean(),
});

const serviceCardSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  image: z.string().min(1),
});

export const siteContentDataSchema = z.object({
  contact: z.object({
    location: z.string().min(1),
    email: emailField(),
    hours: z.string().min(1),
  }),
  hero: z.object({
    slides: z.array(heroSlideSchema).length(2),
  }),
  features: z.array(featureCardSchema).length(4),
  about: z.object({
    image: z.string().min(1),
    paragraph: z.string().min(1),
    bullets: z.array(z.string().min(1)).length(3),
  }),
  services: z.array(serviceCardSchema).length(4),
});

export const updateSiteContentSchema = z.object({
  data: siteContentDataSchema,
});
