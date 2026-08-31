import { Router } from "express";
import * as controller from "../controllers/notificationController";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createNotificationSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

router.use(authenticate);
router.get("/", asyncHandler(controller.list));
router.post(
  "/",
  requireRole(["ADMIN", "MANAGER", "RECEPTIONIST"]),
  validateBody(createNotificationSchema),
  asyncHandler(controller.create)
);

export default router;
