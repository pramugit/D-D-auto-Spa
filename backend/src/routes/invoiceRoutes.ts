import { Router } from "express";
import * as controller from "../controllers/invoiceController";
import { authenticate } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { validateBody } from "../middleware/validate";
import { createPaymentSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";
import { uploadSlip } from "../middleware/upload";

const router = Router();

router.use(authenticate);

router.get("/", requireSection("invoicesPayments", "view"), asyncHandler(controller.list));
router.get("/:id", requireSection("invoicesPayments", "view"), asyncHandler(controller.get));

// requireSection passes customer tokens through (their own bank-transfer-
// only restriction is enforced in the controller); staff need Invoices &
// Payments edit access — this also excludes TECHNICIAN from recording
// payments, which is intentional.
router.post(
  "/:id/payments",
  requireSection("invoicesPayments", "edit"),
  uploadSlip.single("slip"),
  validateBody(createPaymentSchema),
  asyncHandler(controller.createPayment)
);

export default router;
