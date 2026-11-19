import { Router } from "express";
import * as customerController from "../controllers/customerController";
import { authenticate, requireRole } from "../middleware/auth";
import { requireAnySection, requireSection } from "../middleware/permissions";
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
// Creating (not editing/deleting) a customer or vehicle is also needed by
// the Daily Jobs board's "+ New customer" walk-in intake — allowed for
// TECHNICIAN there even though customersVehicles.edit excludes it, same
// derived-from-config sharing pattern as inventoryRoutes.ts's item list.
const canCreateCustomer = requireAnySection(["customersVehicles", "edit"], ["jobBoard", "edit"]);

router.use(authenticate);

router.get("/", requireSection("customersVehicles", "view"), asyncHandler(customerController.list));
router.get("/:id", requireSection("customersVehicles", "view"), asyncHandler(customerController.get));
router.post("/", canCreateCustomer, validateBody(createCustomerSchema), asyncHandler(customerController.create));
router.patch("/:id", canManage, validateBody(updateCustomerSchema), asyncHandler(customerController.update));
// Deleting a customer is a deliberately stricter, ADMIN-only exception
// beyond the coarse customersVehicles.edit set (which includes MANAGER
// and RECEPTIONIST) — not derived from the permissions matrix.
router.delete("/:id", requireRole(["ADMIN"]), asyncHandler(customerController.remove));

router.get("/:id/loyalty", asyncHandler(customerController.getLoyalty));

router.get("/:id/vehicles", requireSection("customersVehicles", "view"), asyncHandler(customerController.listVehicles));
router.post(
  "/:id/vehicles",
  // A customer may add a vehicle to their own record; staff need
  // canCreateCustomer (customersVehicles.edit OR jobBoard.edit — see
  // above). Ownership for the customer case is enforced in the controller.
  (req, res, next) => (req.user?.type === "customer" ? next() : canCreateCustomer(req, res, next)),
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
