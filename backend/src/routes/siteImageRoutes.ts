import { Router } from "express";
import * as controller from "../controllers/siteImageController";
import { authenticate, requireRole } from "../middleware/auth";
import { uploadGallery } from "../middleware/upload";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

// Public: the landing page's gallery slideshow reads this unauthenticated.
router.get("/", asyncHandler(controller.list));

router.put(
  "/:slot",
  authenticate,
  requireRole(["ADMIN"]),
  uploadGallery.single("image"),
  asyncHandler(controller.replace),
);

export default router;
