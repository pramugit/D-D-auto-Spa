import { Router } from "express";
import * as controller from "../controllers/inventoryController";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createInventoryItemSchema, updateInventoryItemSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const manage = requireRole(["ADMIN", "MANAGER"]);

router.use(authenticate, requireRole(["ADMIN", "MANAGER", "TECHNICIAN", "RECEPTIONIST"]));

router.get("/", asyncHandler(controller.list));
router.post("/", manage, validateBody(createInventoryItemSchema), asyncHandler(controller.create));
router.patch("/:id", manage, validateBody(updateInventoryItemSchema), asyncHandler(controller.update));
router.delete("/:id", manage, asyncHandler(controller.remove));

export default router;
