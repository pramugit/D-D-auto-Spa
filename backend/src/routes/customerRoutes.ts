import { Router } from "express";
import * as customerController from "../controllers/customerController";
import { authenticate, requireRole } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { validateBody } from "../middleware/validate";
import {
  createCustomerSchema,
  createVehicleSchema,
  updateCustomerSchema,
  updateVehicleSchema,
} from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const canManage = requireSection("customersVehicles", "edit");

router.use(authenticate);

router.get("/", requireSection("customersVehicles", "view"), asyncHandler(customerController.list));
router.get("/:id", requireSection("customersVehicles", "view"), asyncHandler(customerController.get));
router.post("/", canManage, validateBody(createCustomerSchema), asyncHandler(customerController.create));
router.patch("/:id", canManage, validateBody(updateCustomerSchema), asyncHandler(customerController.update));
// Deleting a customer is a deliberately stricter, ADMIN-only exception
// beyond the coarse customersVehicles.edit set (which includes MANAGER
// and RECEPTIONIST) — not derived from the permissions matrix.
router.delete("/:id", requireRole(["ADMIN"]), asyncHandler(customerController.remove));

router.get("/:id/loyalty", asyncHandler(customerController.getLoyalty));

router.get("/:id/vehicles", requireSection("customersVehicles", "view"), asyncHandler(customerController.listVehicles));
router.post(
  "/:id/vehicles",
  // A customer may add a vehicle to their own record; staff need the
  // canManage role. Ownership for the customer case is enforced in the
  // controller. (requireSection already passes customer tokens through,
  // so this could just be `canManage` directly — kept explicit for
  // readability since it's the one route customers hit here.)
  (req, res, next) => (req.user?.type === "customer" ? next() : canManage(req, res, next)),
  validateBody(createVehicleSchema),
  asyncHandler(customerController.createVehicle)
);
router.patch(
  "/:id/vehicles/:vehicleId",
  canManage,
  validateBody(updateVehicleSchema),
  asyncHandler(customerController.updateVehicle)
);
router.delete("/:id/vehicles/:vehicleId", canManage, asyncHandler(customerController.removeVehicle));

export default router;
