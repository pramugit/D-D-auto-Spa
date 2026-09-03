import { Router } from "express";
import * as controller from "../controllers/serviceController";
import { authenticate } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { validateBody } from "../middleware/validate";
import { createServiceSchema, updateServiceSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const manage = requireSection("serviceCatalog", "edit");

// GET is public (the public landing page's price list, plus a shared read
// utility for booking creation and the customer portal's service picker)
// — only the create/update/delete management actions below require auth.
router.get("/", asyncHandler(controller.list));
router.get("/:id", asyncHandler(controller.get));
router.post("/", authenticate, manage, validateBody(createServiceSchema), asyncHandler(controller.create));
router.patch("/:id", authenticate, manage, validateBody(updateServiceSchema), asyncHandler(controller.update));
router.delete("/:id", authenticate, manage, asyncHandler(controller.remove));

export default router;
