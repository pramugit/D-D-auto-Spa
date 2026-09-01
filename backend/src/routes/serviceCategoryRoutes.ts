import { Router } from "express";
import * as controller from "../controllers/serviceCategoryController";
import { authenticate } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { validateBody } from "../middleware/validate";
import { createServiceCategorySchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const manage = requireSection("serviceCatalog", "edit");

router.use(authenticate);
// GET is a shared read utility (booking creation, the customer portal's
// service picker) used well beyond the Service Catalog management page,
// so it's intentionally NOT gated by serviceCatalog.view — only the
// create/delete management actions below are.
router.get("/", asyncHandler(controller.list));
router.post("/", manage, validateBody(createServiceCategorySchema), asyncHandler(controller.create));
router.delete("/:id", manage, asyncHandler(controller.remove));

export default router;
