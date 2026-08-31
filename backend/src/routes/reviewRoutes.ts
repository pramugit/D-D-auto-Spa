import { Router } from "express";
import * as controller from "../controllers/reviewController";
import { authenticate } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createReviewSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

// Mounted at /job-cards alongside jobCardRoutes, but kept in its own
// router because reviews are a customer-facing action (not staff-only).
const router = Router();

router.use(authenticate);
router.get("/:id/review", asyncHandler(controller.get));
router.post("/:id/review", validateBody(createReviewSchema), asyncHandler(controller.create));

export default router;
