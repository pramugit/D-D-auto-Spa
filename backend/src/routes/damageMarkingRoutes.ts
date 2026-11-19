import { Router } from "express";
import * as controller from "../controllers/damageMarkingController";
import { authenticate } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { validateBody } from "../middleware/validate";
import { damageMarkingDecisionSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

router.use(authenticate);

// Customer-only (ownership enforced in the controller, same pattern as
// damage-inspection acknowledge and the invoice/payment endpoints).
router.patch(
  "/:id/customer-decision",
  validateBody(damageMarkingDecisionSchema),
  asyncHandler(controller.decide)
);

// Staff correction path — same audience as creating the marking in the
// first place (Job Board edit).
router.patch("/:id/reset", requireSection("jobBoard", "edit"), asyncHandler(controller.reset));

export default router;
