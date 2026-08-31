import { Router } from "express";
import * as controller from "../controllers/serviceController";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createServiceSchema, updateServiceSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const manage = requireRole(["ADMIN", "MANAGER"]);

router.use(authenticate);
router.get("/", asyncHandler(controller.list));
router.get("/:id", asyncHandler(controller.get));
router.post("/", manage, validateBody(createServiceSchema), asyncHandler(controller.create));
router.patch("/:id", manage, validateBody(updateServiceSchema), asyncHandler(controller.update));
router.delete("/:id", manage, asyncHandler(controller.remove));

export default router;
