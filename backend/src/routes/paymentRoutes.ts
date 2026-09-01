import { Router } from "express";
import * as controller from "../controllers/invoiceController";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { verifyPaymentSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

router.use(authenticate);
// Deliberately stricter than invoicesPayments.edit (which includes
// RECEPTIONIST) — verifying a bank transfer is a fraud-prevention
// checkpoint, not general invoice/payment handling, so it stays its own
// explicit rule rather than deriving from the section matrix.
router.patch(
  "/:id/verify",
  requireRole(["ADMIN", "MANAGER"]),
  validateBody(verifyPaymentSchema),
  asyncHandler(controller.verifyPayment)
);

export default router;
