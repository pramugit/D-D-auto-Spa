import { Router } from "express";
import * as controller from "../controllers/siteContentController";
import { authenticate, requireRole } from "../middleware/auth";
import { uploadContentImage } from "../middleware/upload";
import { validateBody } from "../middleware/validate";
import { updatePaymentQrSchema, updateSiteContentSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";
import { AppError } from "../utils/AppError";

const router = Router();

// Public: the landing page reads this unauthenticated.
router.get("/:key", asyncHandler(controller.get));

router.put(
  "/:key",
  authenticate,
  requireRole(["ADMIN"]),
  // Each key has its own shape: "landing" is the public site's content,
  // "payment-qr" is the shop's scan-to-pay QR image shown at the counter.
  (req, res, next) =>
    req.params.key === "report-settings" || req.params.key === "payroll-settings"
      ? next(new AppError(404, "Not found"))
      : validateBody(req.params.key === "payment-qr" ? updatePaymentQrSchema : updateSiteContentSchema)(req, res, next),
  asyncHandler(controller.update),
);

router.post(
  "/upload-image",
  authenticate,
  requireRole(["ADMIN"]),
  uploadContentImage.single("image"),
  asyncHandler(controller.uploadImage),
);

export default router;
