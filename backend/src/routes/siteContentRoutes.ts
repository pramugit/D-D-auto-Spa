import { Router } from "express";
import * as controller from "../controllers/siteContentController";
import { authenticate, requireRole } from "../middleware/auth";
import { uploadContentImage } from "../middleware/upload";
import { validateBody } from "../middleware/validate";
import { updateSiteContentSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

// Public: the landing page reads this unauthenticated.
router.get("/:key", asyncHandler(controller.get));

router.put(
  "/:key",
  authenticate,
  requireRole(["ADMIN"]),
  validateBody(updateSiteContentSchema),
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
