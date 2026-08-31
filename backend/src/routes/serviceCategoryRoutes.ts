import { Router } from "express";
import * as controller from "../controllers/serviceCategoryController";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createServiceCategorySchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const manage = requireRole(["ADMIN", "MANAGER"]);

router.use(authenticate);
router.get("/", asyncHandler(controller.list));
router.post("/", manage, validateBody(createServiceCategorySchema), asyncHandler(controller.create));
router.delete("/:id", manage, asyncHandler(controller.remove));

export default router;
