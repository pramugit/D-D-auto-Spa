import { Router } from "express";
import * as controller from "../controllers/payrollController";
import { authenticate } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { validateBody } from "../middleware/validate";
import { payrollAdjustSchema, payrollMonthSchema, payrollSettingsSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const manage = requireSection("payroll", "edit"); // ADMIN only

router.use(authenticate, requireSection("payroll", "view"));

router.get("/", asyncHandler(controller.list));
router.get("/epf", asyncHandler(controller.epfReport));
router.get("/settings", asyncHandler(controller.getSettings));
router.put("/settings", manage, validateBody(payrollSettingsSchema), asyncHandler(controller.saveSettings));
router.post("/generate", manage, validateBody(payrollMonthSchema), asyncHandler(controller.generate));
router.patch("/:id/pay", manage, asyncHandler(controller.markPaid));
router.patch("/:id/adjust", manage, validateBody(payrollAdjustSchema), asyncHandler(controller.adjust));

export default router;
