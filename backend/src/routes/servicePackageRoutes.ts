import { Router } from "express";
import * as controller from "../controllers/servicePackageController";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createServicePackageSchema, updateServicePackageSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const manage = requireRole(["ADMIN", "MANAGER"]);

router.use(authenticate);
router.get("/", asyncHandler(controller.list));
router.get("/:id", asyncHandler(controller.get));
router.post("/", manage, validateBody(createServicePackageSchema), asyncHandler(controller.create));
router.patch("/:id", manage, validateBody(updateServicePackageSchema), asyncHandler(controller.update));
router.delete("/:id", manage, asyncHandler(controller.remove));

export default router;
