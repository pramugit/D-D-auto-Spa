import { Router } from "express";
import * as controller from "../controllers/jobCardController";
import * as invoiceController from "../controllers/invoiceController";
import * as inventoryController from "../controllers/inventoryController";
import { authenticate } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
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
const viewJobBoard = requireSection("jobBoard", "view");
const editJobBoard = requireSection("jobBoard", "edit");

// `authenticate` only at the router level — NOT a section gate. This
// router is mounted at the same "/job-cards" prefix as reviewRoutes
// (a customer-facing router); a blanket gate here would run for every
// request under that prefix, including ones meant for reviewRoutes,
// before Express ever checks whether this router has a matching route.
// Each route below applies its own gate instead.
router.use(authenticate);

router.get("/", viewJobBoard, asyncHandler(controller.list));
router.get("/:id", viewJobBoard, asyncHandler(controller.get));
router.patch(
  "/:id/assign-technician",
  editJobBoard,
  validateBody(assignTechniciansSchema),
  asyncHandler(controller.assignTechnicians)
);
router.patch("/:id/notes", editJobBoard, validateBody(jobCardNotesSchema), asyncHandler(controller.updateNotes));

router.post(
  "/:id/damage-inspection",
  editJobBoard,
  validateBody(createDamageInspectionSchema),
  asyncHandler(controller.createDamageInspection)
);

router.post("/:id/photos", editJobBoard, uploadPhoto.single("photo"), asyncHandler(controller.uploadPhoto));

// Generating an invoice is an Invoices & Payments action, not a Job
// Board one, even though it's triggered from the job card page.
router.post(
  "/:id/invoice",
  requireSection("invoicesPayments", "edit"),
  validateBody(createInvoiceSchema),
  asyncHandler(invoiceController.createForJobCard)
);

router.post(
  "/:id/inventory-usage",
  editJobBoard,
  validateBody(createInventoryUsageSchema),
  asyncHandler(inventoryController.recordUsage)
);

// Profit is financially sensitive — same role set as the Ops Dashboard.
router.get("/:id/profit", requireSection("opsDashboard", "view"), asyncHandler(controller.profit));

export default router;
