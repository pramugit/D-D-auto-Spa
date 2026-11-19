import { z } from "zod";
import {
  durationMinutesField,
  emailField,
  isoDateTimeField,
  nameField,
  noteField,
  optionalEmailField,
  phoneField,
  plateNumberField,
  positiveNumberField,
  priceField,
} from "./validators";

export const staffRoleEnum = z.enum(["ADMIN", "MANAGER", "TECHNICIAN", "RECEPTIONIST"]);
export const vehicleTypeEnum = z.enum(["SEDAN", "HATCHBACK", "SUV", "VAN", "JEEP", "CAB", "LORRY", "SEVEN_SEATER", "BUS", "THREE_WHEELER", "MOTORBIKE"]);

/** Odometer reading in km. */
export const mileageField = () => z.number().int("Mileage must be a whole number").min(0, "Mileage can't be negative").max(3_000_000, "That mileage looks too high");
export const serviceCategoryNameEnum = z.enum(["EXTERIOR", "INTERIOR"]);
export const bayStatusEnum = z.enum(["AVAILABLE", "OCCUPIED", "MAINTENANCE"]);
export const damageSeverityEnum = z.enum(["MINOR", "MODERATE", "SEVERE"]);

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

export const changeCustomerPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
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
  mileage: mileageField().nullable().optional(),
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
  // Null/omitted = the package takes as long as its services added up.
  durationMinutes: durationMinutesField().nullable().optional(),
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
export const photoTypeEnum = z.enum(["BEFORE", "AFTER", "PROGRESS"]);
export const diagramViewEnum = z.enum(["FRONT", "REAR", "LEFT_SIDE", "RIGHT_SIDE"]);

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
  scheduledAt: isoDateTimeField().refine((d) => d.getTime() > Date.now(), {
    message: "scheduledAt must be in the future",
  }),
  items: z.array(bookingLineItemSchema).min(1),
});

// No scheduledAt — a walk-in is created at "now" server-side (createWalkInJob).
export const createWalkInJobSchema = z.object({
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  items: z.array(bookingLineItemSchema).min(1),
  mileage: mileageField().optional(),
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
  // Ignored — a job card has a single inspection now (stored PRE_SERVICE).
  // Still accepted so older clients don't fail validation.
  stage: inspectionStageEnum.optional(),
  markings: z.array(
    z.object({
      // An existing marker being edited (absent = new marker).
      id: z.string().uuid().optional(),
      // No longer user-selectable — always FRONT, kept only because the
      // column is still NOT NULL (see DamageMarking.view in schema.prisma).
      view: diagramViewEnum,
      // A raycast hit point on the vehicle's 3D model surface, in the
      // model's local object space. The bound is a generous sanity check
      // (Kenney's kit models are a few units across), not a tight fit to
      // any one model's exact geometry.
      x: z.number().min(-50).max(50),
      y: z.number().min(-50).max(50),
      z: z.number().min(-50).max(50),
      // Dropdown-constrained to the DamageType catalog — never free text
      // (Phase G). Still optional: a marking can be plain documentation
      // with only a free-text note and no catalog type.
      damageTypeId: z.string().uuid().optional(),
      note: noteField().optional(),
      // Defaults to the picked DamageType's defaultPrice client-side, but
      // staff may override it per marking — only meaningful when
      // isAdditionalRepairOffer is true.
      suggestedPrice: priceField().optional(),
      // OFF (default): ordinary pre-existing-damage documentation, stays
      // unbillable and needs no customer decision — the liability-
      // protection use case. ON: a billable extra the customer must
      // approve or decline (see damageMarkingRoutes.ts's decide route).
      isAdditionalRepairOffer: z.boolean().optional(),
      severity: damageSeverityEnum.optional(),
      // Set by POST /job-cards/upload-damage-photo before this marking is
      // saved — never a client-supplied external URL.
      photoUrl: z.string().max(500).optional(),
    })
  ),
});

// ---- Booked-job flow (job card page) ----
export const flowBaySchema = z.object({ bayId: z.string().uuid() });
export const flowCooldownSchema = z.object({ minutes: z.number().int().min(1).max(120) });
export const flowTimingSchema = z.object({
  waiting: z.enum(["LOUNGE", "LEAVE"]),
  readyAt: z.coerce.date(),
  send: z.boolean(),
});
export const flowExtraWorkSchema = z.object({
  damageTypeId: z.string().uuid().optional(),
  note: z.string().trim().max(300).optional(),
  price: z.number().min(0).max(10_000_000),
  photoUrl: z.string().max(500).optional(),
  severity: z.enum(["MINOR", "MODERATE", "SEVERE"]).optional(),
  send: z.boolean(),
});

// The customer's answer to an inspection report (public link or in person):
// a decision per pending repair offer, plus an optional comment.
export const inspectionResponseSchema = z.object({
  decisions: z.array(z.object({ markingId: z.string().uuid(), approved: z.boolean() })).max(200),
  comment: z.string().trim().max(500).optional(),
});

export const createDamageTypeSchema = z.object({
  name: nameField(),
  defaultPrice: priceField(),
  repairMinutes: z.number().int("Whole minutes only").min(0, "Can't be negative").max(1440, "At most 24 hours").optional(),
  category: serviceCategoryNameEnum,
});

export const updateDamageTypeSchema = createDamageTypeSchema.partial();

export const damageMarkingDecisionSchema = z.object({
  approved: z.boolean(),
});

export const jobCardNotesSchema = z.object({
  notes: z.string().optional(),
});

export const paymentMethodEnum = z.enum(["CASH", "CARD", "BANK_TRANSFER", "QR"]);
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

export const createBankAccountSchema = z.object({
  bankName: z.string().min(1),
  accountName: z.string().min(1),
  accountNumber: z.string().min(1),
  branch: z.string().optional(),
  active: z.boolean().optional(),
});

export const updateBankAccountSchema = createBankAccountSchema.partial();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    // Not sent (undefined) stays undefined so a partial update leaves the field alone;
    // an empty string clears it.
    .transform((v) => (v === undefined ? undefined : v ? v : null));

export const createInventoryItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  unit: z.string().trim().min(1).max(20),
  quantityInStock: priceField(),
  reorderLevel: priceField(),
  costPerUnit: priceField().optional(),
  category: optionalText(50),
  supplierName: optionalText(100),
  supplierPhone: optionalText(30),
  reorderQuantity: priceField().optional().nullable(),
});

// Stock level is deliberately NOT editable here — it changes only through
// receive / count / job usage, so every change lands in the history.
export const updateInventoryItemSchema = createInventoryItemSchema.omit({ quantityInStock: true }).partial();

export const receiveStockSchema = z.object({
  quantity: positiveNumberField(),
  unitCost: priceField().optional(),
  note: z.string().trim().max(200).optional(),
});

export const countStockSchema = z.object({
  counted: priceField(),
  note: z.string().trim().max(200).optional(),
});

export const setRecipeSchema = z.object({
  items: z
    .array(z.object({ itemId: z.string().uuid(), quantity: z.coerce.number().positive().max(100000) }))
    .max(50),
});

// Either draws from stock (itemId, sourceType INTERNAL_STOCK — the
// default) or, when the requested quantity exceeds on-hand stock, records
// an outside purchase billed straight to the customer (sourceType
// EXTERNAL_PURCHASE + externalName + externalCost).
export const createInventoryUsageSchema = z
  .object({
    itemId: z.string().uuid().optional(),
    quantityUsed: positiveNumberField(),
    sourceType: z.enum(["INTERNAL_STOCK", "EXTERNAL_PURCHASE"]).optional(),
    externalName: z.string().min(1).optional(),
    externalCost: priceField().optional(),
    externalVendorNote: noteField().optional(),
  })
  .refine(
    (v) =>
      v.sourceType === "EXTERNAL_PURCHASE"
        ? !!v.externalName && v.externalCost !== undefined
        : !!v.itemId,
    {
      message:
        "Provide itemId for stock usage, or sourceType: EXTERNAL_PURCHASE with externalName and externalCost for an outside purchase",
    }
  );

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const notificationTypeEnum = z.enum([
  "BOOKING_RECEIVED",
  "BOOKING_CONFIRMED",
  "TECHNICIAN_ASSIGNED",
  "JOB_STARTED",
  "JOB_QUALITY_CHECK",
  "JOB_READY",
  "JOB_COMPLETED",
  "BOOKING_CANCELLED",
  "PAYMENT_VERIFIED",
  "PHOTO_UPDATE",
  "GENERAL",
]);
export const notificationChannelEnum = z.enum(["SMS", "EMAIL", "WHATSAPP"]);

export const createNotificationSchema = z.object({
  customerId: z.string().uuid(),
  type: notificationTypeEnum,
  message: z.string().min(1),
  channel: notificationChannelEnum,
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    // Not sent (undefined) stays undefined so a partial update leaves the field alone;
    // an empty string clears it.
    .transform((v) => (v === undefined ? undefined : v ? v : null));

// Staff management details (all optional).
const staffDetailsFields = {
  // Exactly 4 digits — it's also the staff member's Attendance kiosk PIN.
  employeeCode: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}$/.test(v), "Employee code must be exactly 4 digits")
    .optional()
    .nullable()
    .transform((v) => (v === undefined ? undefined : v ? v : null)),
  joinedAt: z.coerce.date().optional().nullable(),
  nic: optText(20),
  address: optText(200),
  emergencyName: optText(100),
  emergencyPhone: optText(30),
  bankName: optText(100),
  bankAccount: optText(40),
  shiftStart: hhmm.optional(),
  shiftEnd: hhmm.optional(),
  epfMember: z.boolean().optional(),
  epfNumber: optText(30),
};

export const createUserSchema = registerStaffSchema.extend({
  hourlyRate: priceField().optional(),
  monthlySalary: priceField().optional(),
  ...staffDetailsFields,
});
export const updateUserSchema = z.object({
  name: nameField().optional(),
  email: emailField().optional(),
  phone: phoneField().optional(),
  role: staffRoleEnum.optional(),
  password: z.string().min(8).optional(),
  hourlyRate: priceField().nullable().optional(),
  monthlySalary: priceField().nullable().optional(),
  active: z.boolean().optional(),
  ...staffDetailsFields,
});

// Shared-device clock-in kiosk: the staff member types their 4-digit
// employee code and picks in or out.
export const attendanceKioskPunchSchema = z.object({
  code: z.string().regex(/^\d{4}$/, "Enter your 4-digit code"),
  action: z.enum(["in", "out"]),
});
export const attendanceKioskExitSchema = z.object({ password: z.string().min(1) });

export const attendanceRecordSchema = z
  .object({
    userId: z.string().uuid(),
    clockIn: z.coerce.date(),
    clockOut: z.coerce.date().optional().nullable(),
  })
  .refine((v) => !v.clockOut || v.clockOut > v.clockIn, { message: "Clock-out must be after clock-in", path: ["clockOut"] });

export const attendanceRecordUpdateSchema = z
  .object({ clockIn: z.coerce.date(), clockOut: z.coerce.date().optional().nullable() })
  .refine((v) => !v.clockOut || v.clockOut > v.clockIn, { message: "Clock-out must be after clock-in", path: ["clockOut"] });

export const leaveCreateSchema = z
  .object({
    userId: z.string().uuid().optional(),
    type: z.enum(["ANNUAL", "CASUAL", "SICK", "UNPAID"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().max(300).optional(),
    approve: z.boolean().optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "End date must be on or after the start date", path: ["endDate"] });

export const leaveDecisionSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]) });

export const payrollAdjustSchema = z.object({
  bonus: z.coerce.number().min(0).max(10_000_000),
  otherDeductions: z.coerce.number().min(0).max(10_000_000),
  note: z.string().trim().max(200).optional().nullable(),
});

// ---- WebAuthn (Inventory unlock) ----
// `response` is the raw RegistrationResponseJSON/AuthenticationResponseJSON
// the browser's navigator.credentials call produces — its shape is
// verified structurally by @simplewebauthn/server itself (verifyRegistrationResponse
// / verifyAuthenticationResponse throw on anything malformed), so zod's job
// here is just making sure the field exists, not re-validating WebAuthn's
// own wire format.
export const webauthnRegisterVerifySchema = z.object({
  deviceName: z.string().trim().min(1).max(60),
  response: z.record(z.string(), z.unknown()),
});
export const webauthnUnlockVerifySchema = z.object({
  response: z.record(z.string(), z.unknown()),
});
const inventoryPin = z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits");
export const inventoryPinUnlockSchema = z.object({ pin: inventoryPin });
export const inventoryPinSetSchema = z.object({ password: z.string().min(1), pin: inventoryPin });
export const webauthnUnlockPasswordSchema = z.object({
  password: z.string().min(1),
});

// ---- Payroll ----
// "YYYY-MM" only — a specific day within the month is meaningless here,
// generation always snaps to the 1st (see payrollService.ts).
export const payrollMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Must be in YYYY-MM form"),
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
    phone: z.string().trim().max(80).optional(),
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

export const updatePaymentQrSchema = z.object({
  data: z.object({
    imageUrl: z.string().trim().min(1).max(500),
    note: z.string().trim().max(200).optional(),
  }),
});

export const importInventorySchema = z.object({
  note: z.string().trim().max(200).optional(),
  rows: z
    .array(
      z.object({
        itemId: z.string().uuid().optional().nullable(),
        name: z.string().trim().min(1).max(100),
        unit: z.string().trim().max(20).default("pcs"),
        quantity: z.coerce.number().min(0).max(1_000_000),
        unitCost: z.coerce.number().min(0).max(10_000_000).optional().nullable(),
        category: z.string().trim().max(50).optional().nullable(),
        reorderLevel: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
        supplierName: z.string().trim().max(100).optional().nullable(),
        supplierPhone: z.string().trim().max(30).optional().nullable(),
      })
    )
    .min(1, "Nothing to import")
    .max(500, "Import at most 500 rows at a time"),
});

export const dailyReportSettingsSchema = z.object({
  enabled: z.boolean(),
  whatsappNumber: z.string().trim().max(30),
  hour: z.coerce.number().int().min(0).max(23),
});

export const payrollSettingsSchema = z.object({
  epfEmployeeRate: z.coerce.number().min(0).max(50),
  epfEmployerRate: z.coerce.number().min(0).max(50),
  etfRate: z.coerce.number().min(0).max(50),
  employerName: z.string().trim().max(120),
  employerEpfNumber: z.string().trim().max(40),
  employerEtfNumber: z.string().trim().max(40),
});

const hhmmTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");
const dayHoursSchema = z.object({ open: z.boolean(), start: hhmmTime, end: hhmmTime });
export const scheduleSettingsSchema = z.object({
  hours: z.object({
    mon: dayHoursSchema,
    tue: dayHoursSchema,
    wed: dayHoursSchema,
    thu: dayHoursSchema,
    fri: dayHoursSchema,
    sat: dayHoursSchema,
    sun: dayHoursSchema,
  }),
  slotMinutes: z.coerce.number().int().refine((v) => [15, 20, 30, 45, 60].includes(v), "Slot length must be 15, 20, 30, 45 or 60 minutes"),
  bufferMinutes: z.coerce.number().int().min(0).max(120),
  minNoticeHours: z.coerce.number().min(0).max(168),
  maxDaysAhead: z.coerce.number().int().min(1).max(365),
  customerChangeHours: z.coerce.number().min(0).max(168),
  closedDates: z
    .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().max(80) }))
    .max(200),
});

export const rescheduleSchema = z.object({
  scheduledAt: isoDateTimeField(),
  notes: z.string().trim().max(200).optional(),
});

// ── Customer booking requests ──
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const bookingRequestSchema = z
  .object({
    vehicleId: z.string().uuid(),
    items: z.array(bookingLineItemSchema).min(1, "Choose at least one service or package"),
    preferredFrom: isoDay,
    preferredTo: isoDay,
    preferredTime: z.enum(["MORNING", "AFTERNOON", "ANY"]).default("ANY"),
    message: z.string().trim().max(500, "Keep the message under 500 characters").optional(),
    contactPhone: phoneField().optional(),
    contactEmail: z.string().trim().toLowerCase().email("Must be a valid email address").optional(),
    contactVia: z.enum(["WHATSAPP", "EMAIL", "BOTH"]).default("WHATSAPP"),
  })
  .refine((v) => v.preferredTo >= v.preferredFrom, { message: "The last preferred date must be on or after the first", path: ["preferredTo"] })
  .refine((v) => (Date.parse(v.preferredTo) - Date.parse(v.preferredFrom)) / 86400000 <= 31, {
    message: "Pick a range of up to a month",
    path: ["preferredTo"],
  });

export const proposeTimeSchema = z.object({
  scheduledAt: isoDateTimeField(),
  note: z.string().trim().max(300).optional(),
});

export const askAnotherTimeSchema = z.object({
  message: z.string().trim().max(300).optional(),
});
