import { Router } from "express";
import * as controller from "../controllers/inventoryController";
import { authenticate } from "../middleware/auth";
import { requireAnySection, requireSection } from "../middleware/permissions";
import { validateBody } from "../middleware/validate";
import { createInventoryItemSchema, updateInventoryItemSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const manage = requireSection("inventory", "edit");

router.use(authenticate);

// The Inventory section itself is ADMIN/MANAGER-only, but this GET is
// also what populates the "item used" dropdown on the Job Board's job
// card page (a pre-existing feature) — so it's allowed for anyone who
// can view Inventory OR edit the Job Board, derived from the config
// rather than a hand-written role array, so either section's entry
// changing still propagates here automatically.
router.get("/", requireAnySection(["inventory", "view"], ["jobBoard", "edit"]), asyncHandler(controller.list));
router.post("/", manage, validateBody(createInventoryItemSchema), asyncHandler(controller.create));
router.patch("/:id", manage, validateBody(updateInventoryItemSchema), asyncHandler(controller.update));
router.delete("/:id", manage, asyncHandler(controller.remove));

export default router;
