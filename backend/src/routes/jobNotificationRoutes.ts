import { Router } from "express";
import * as controller from "../controllers/jobNotificationController";
import { authenticate } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

router.use(authenticate);
router.get("/", requireSection("jobNotifications", "view"), asyncHandler(controller.list));

export default router;
