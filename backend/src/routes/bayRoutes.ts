import { Router } from "express";
import * as controller from "../controllers/bayController";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createBaySchema, updateBaySchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const manage = requireRole(["ADMIN", "MANAGER"]);

router.use(authenticate);
router.get("/", asyncHandler(controller.list));
router.post("/", manage, validateBody(createBaySchema), asyncHandler(controller.create));
router.patch("/:id", requireRole(["ADMIN", "MANAGER", "RECEPTIONIST"]), validateBody(updateBaySchema), asyncHandler(controller.update));
router.delete("/:id", manage, asyncHandler(controller.remove));

export default router;
