import { Router } from "express";
import * as controller from "../controllers/damageInspectionController";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

router.use(authenticate);
router.patch("/:id/acknowledge", asyncHandler(controller.acknowledge));

export default router;
