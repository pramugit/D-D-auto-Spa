import { Router } from "express";
import * as controller from "../controllers/jobCardController";
import { authenticate, requireRole, requireStaff } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { assignTechniciansSchema, createDamageInspectionSchema, jobCardNotesSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";
import { uploadPhoto } from "../middleware/upload";

const router = Router();
const manage = requireRole(["ADMIN", "MANAGER", "RECEPTIONIST"]);

router.use(authenticate, requireStaff);

router.get("/", asyncHandler(controller.list));
router.get("/:id", asyncHandler(controller.get));
router.patch(
  "/:id/assign-technician",
  manage,
  validateBody(assignTechniciansSchema),
  asyncHandler(controller.assignTechnicians)
);
router.patch("/:id/notes", validateBody(jobCardNotesSchema), asyncHandler(controller.updateNotes));

router.post(
  "/:id/damage-inspection",
  validateBody(createDamageInspectionSchema),
  asyncHandler(controller.createDamageInspection)
);

router.post("/:id/photos", uploadPhoto.single("photo"), asyncHandler(controller.uploadPhoto));

export default router;
