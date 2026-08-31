import { Router } from "express";
import * as customerController from "../controllers/customerController";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import {
  createCustomerSchema,
  createVehicleSchema,
  updateCustomerSchema,
  updateVehicleSchema,
} from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const canManage = requireRole(["ADMIN", "MANAGER", "RECEPTIONIST"]);

router.use(authenticate);

router.get("/", asyncHandler(customerController.list));
router.get("/:id", asyncHandler(customerController.get));
router.post("/", canManage, validateBody(createCustomerSchema), asyncHandler(customerController.create));
router.patch("/:id", canManage, validateBody(updateCustomerSchema), asyncHandler(customerController.update));
router.delete("/:id", requireRole(["ADMIN"]), asyncHandler(customerController.remove));

router.get("/:id/loyalty", asyncHandler(customerController.getLoyalty));

router.get("/:id/vehicles", asyncHandler(customerController.listVehicles));
router.post(
  "/:id/vehicles",
  canManage,
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
