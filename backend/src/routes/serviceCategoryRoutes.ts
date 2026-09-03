import { Router } from "express";
import * as controller from "../controllers/serviceCategoryController";
import { authenticate } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { validateBody } from "../middleware/validate";
import { createServiceCategorySchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const manage = requireSection("serviceCatalog", "edit");

// GET is public (the public landing page's price list, plus a shared read
// utility for booking creation and the customer portal's service picker)
// — only the create/delete management actions below require auth.
router.get("/", asyncHandler(controller.list));
router.post("/", authenticate, manage, validateBody(createServiceCategorySchema), asyncHandler(controller.create));
router.delete("/:id", authenticate, manage, asyncHandler(controller.remove));

export default router;
