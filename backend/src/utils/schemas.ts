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

export const createUserSchema = registerStaffSchema;
export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  role: staffRoleEnum.optional(),
  password: z.string().min(8).optional(),
});
