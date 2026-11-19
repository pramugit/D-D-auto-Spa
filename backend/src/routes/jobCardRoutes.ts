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
  flowBaySchema,
  flowCooldownSchema,
  flowTimingSchema,
  flowExtraWorkSchema,
} from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";
import { uploadDamagePhoto, uploadPhoto } from "../middleware/upload";

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

// Booked-job flow steps (see services/jobFlowService.ts). "/flow/bays" is
// registered before "/:id" so it isn't read as a job card id.
router.get("/flow/bays", viewJobBoard, asyncHandler(controller.flowBays));
router.post("/:id/flow/bay", editJobBoard, validateBody(flowBaySchema), asyncHandler(controller.checkInBay));
router.post("/:id/flow/cooldown", editJobBoard, validateBody(flowCooldownSchema), asyncHandler(controller.startCooldown));
router.post("/:id/flow/cooldown/done", editJobBoard, asyncHandler(controller.finishCooldown));
router.post("/:id/flow/timing", editJobBoard, validateBody(flowTimingSchema), asyncHandler(controller.sendTiming));
router.post("/:id/flow/extra-work", editJobBoard, validateBody(flowExtraWorkSchema), asyncHandler(controller.addExtraWork));
router.delete("/:id/flow/extra-work/:markingId", editJobBoard, asyncHandler(controller.removeExtraWork));
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
// Not under "/:id" — the marking (and its job card save) doesn't exist
// yet when a staff member attaches a photo while filling in the marker
// form; this just uploads and hands back a URL to include in the
// eventual "/:id/damage-inspection" bulk save.
router.post("/upload-damage-photo", editJobBoard, uploadDamagePhoto.single("photo"), asyncHandler(controller.uploadDamagePhoto));

router.post("/:id/photos", editJobBoard, uploadPhoto.single("photo"), asyncHandler(controller.uploadPhoto));
router.post("/:id/photos/:photoId/send-whatsapp", editJobBoard, asyncHandler(controller.sendPhotoWhatsApp));
router.post("/:id/send-images-whatsapp", editJobBoard, asyncHandler(controller.sendImagesWhatsApp));

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
router.delete("/:id/inventory-usage/:usageId", editJobBoard, asyncHandler(inventoryController.removeUsage));

// Profit is financially sensitive — same role set as the Ops Dashboard.
router.get("/:id/profit", requireSection("opsDashboard", "view"), asyncHandler(controller.profit));

export default router;
