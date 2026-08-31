import { Router } from "express";
import * as controller from "../controllers/invoiceController";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { verifyPaymentSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

router.use(authenticate);
router.patch(
  "/:id/verify",
  requireRole(["ADMIN", "MANAGER"]),
  validateBody(verifyPaymentSchema),
  asyncHandler(controller.verifyPayment)
);

export default router;
