import { Router } from "express";
import * as controller from "../controllers/jobCardController";
import * as invoiceController from "../controllers/invoiceController";
import * as inventoryController from "../controllers/inventoryController";
import { authenticate, requireRole, requireStaff } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import {
  assignTechniciansSchema,
  createDamageInspectionSchema,
  createInventoryUsageSchema,
  createInvoiceSchema,
  jobCardNotesSchema,
} from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";
import { uploadPhoto } from "../middleware/upload";

const router = Router();
const manage = requireRole(["ADMIN", "MANAGER", "RECEPTIONIST"]);

// `authenticate` only at the router level — NOT `requireStaff`. This
// router is mounted at the same "/job-cards" prefix as reviewRoutes
// (a customer-facing router); a blanket requireStaff here would run for
// every request under that prefix, including ones meant for
// reviewRoutes, before Express ever checks whether this router has a
// matching route. Each staff-only route below applies requireStaff (or
// a narrower role) itself instead.
router.use(authenticate);

router.get("/", requireStaff, asyncHandler(controller.list));
router.get("/:id", requireStaff, asyncHandler(controller.get));
router.patch(
  "/:id/assign-technician",
  manage,
  validateBody(assignTechniciansSchema),
  asyncHandler(controller.assignTechnicians)
);
router.patch("/:id/notes", requireStaff, validateBody(jobCardNotesSchema), asyncHandler(controller.updateNotes));

router.post(
  "/:id/damage-inspection",
  requireStaff,
  validateBody(createDamageInspectionSchema),
  asyncHandler(controller.createDamageInspection)
);

router.post("/:id/photos", requireStaff, uploadPhoto.single("photo"), asyncHandler(controller.uploadPhoto));

router.post(
  "/:id/invoice",
  manage,
  validateBody(createInvoiceSchema),
  asyncHandler(invoiceController.createForJobCard)
);

router.post(
  "/:id/inventory-usage",
  requireStaff,
  validateBody(createInventoryUsageSchema),
  asyncHandler(inventoryController.recordUsage)
);

export default router;
