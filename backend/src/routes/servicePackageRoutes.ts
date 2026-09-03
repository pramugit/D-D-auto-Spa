import { Router } from "express";
import * as controller from "../controllers/servicePackageController";
import { authenticate } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { validateBody } from "../middleware/validate";
import { createServicePackageSchema, updateServicePackageSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const manage = requireSection("serviceCatalog", "edit");

// GET is public (the public landing page's price list), same reasoning as
// serviceRoutes.ts — only the create/update/delete management actions below
// require auth.
router.get("/", asyncHandler(controller.list));
router.get("/:id", asyncHandler(controller.get));
router.post("/", authenticate, manage, validateBody(createServicePackageSchema), asyncHandler(controller.create));
router.patch("/:id", authenticate, manage, validateBody(updateServicePackageSchema), asyncHandler(controller.update));
router.delete("/:id", authenticate, manage, asyncHandler(controller.remove));

export default router;
