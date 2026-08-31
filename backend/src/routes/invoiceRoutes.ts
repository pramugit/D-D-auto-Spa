import { Router } from "express";
import * as controller from "../controllers/invoiceController";
import { authenticate } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createPaymentSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";
import { uploadSlip } from "../middleware/upload";

const router = Router();

router.use(authenticate);

router.get("/", asyncHandler(controller.list));
router.get("/:id", asyncHandler(controller.get));

router.post(
  "/:id/payments",
  uploadSlip.single("slip"),
  validateBody(createPaymentSchema),
  asyncHandler(controller.createPayment)
);

export default router;
