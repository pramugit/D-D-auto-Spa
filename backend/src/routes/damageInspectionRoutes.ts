import { Router } from "express";
import * as controller from "../controllers/damageInspectionController";
import { authenticate } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { validateBody } from "../middleware/validate";
import { inspectionResponseSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

router.use(authenticate);
router.patch("/:id/acknowledge", asyncHandler(controller.acknowledge));

// Step 2 of the inspection flow — share the no-login approval link.
const editJobBoard = requireSection("jobBoard", "edit");
router.post("/:id/link", editJobBoard, asyncHandler(controller.getLink));
router.post("/:id/send", editJobBoard, asyncHandler(controller.sendToCustomer));
// Step 3 recorded by the front desk for a customer standing at the counter.
router.post(
  "/:id/confirm-in-person",
  editJobBoard,
  validateBody(inspectionResponseSchema),
  asyncHandler(controller.confirmInPerson),
);

export default router;
