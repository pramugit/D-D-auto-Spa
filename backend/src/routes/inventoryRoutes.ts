import { Router } from "express";
import * as controller from "../controllers/inventoryController";
import { authenticate } from "../middleware/auth";
import { requireAnySection, requireSection } from "../middleware/permissions";
import { requireInventoryUnlock } from "../middleware/inventoryUnlock";
import { validateBody } from "../middleware/validate";
import {
  countStockSchema,
  createInventoryItemSchema,
  importInventorySchema,
  receiveStockSchema,
  setRecipeSchema,
  updateInventoryItemSchema,
} from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";
import { uploadStockDocument } from "../middleware/upload";

const router = Router();
// Every write also requires the fingerprint/passkey (or password
// fallback) unlock — see middleware/inventoryUnlock.ts. It's layered on
// top of, not instead of, the normal edit permission.
const manage = [requireSection("inventory", "edit"), requireInventoryUnlock];

router.use(authenticate);

// Managing the Inventory section (create/edit/delete) is ADMIN/MANAGER-only,
// but this GET is also what populates the "item used" dropdown on the Job
// Board's job card page (a pre-existing feature) — so it's allowed for
// anyone who can view Inventory (now including TECHNICIAN) OR edit the Job
// Board, derived from the config rather than a hand-written role array, so
// either section's entry changing still propagates here automatically.
// Deliberately NOT behind requireInventoryUnlock: that would block the Job
// Board's parts-picker (an unrelated, routine job-fulfillment flow) behind
// a prompt meant for the Inventory management page. The Inventory page
// itself is still gated — see InventoryUnlockGate.tsx on the frontend,
// which blocks rendering the page (including this same list) until unlocked.
router.get("/", requireAnySection(["inventory", "view"], ["jobBoard", "edit"]), asyncHandler(controller.list));
// The Inventory page's own reads — behind the same unlock as its writes.
const viewPage = [requireSection("inventory", "view"), requireInventoryUnlock];
router.get("/overview", viewPage, asyncHandler(controller.overview));
router.get("/movements", viewPage, asyncHandler(controller.movements));
router.get("/recipes", viewPage, asyncHandler(controller.recipes));
router.put("/recipes/:serviceId", manage, validateBody(setRecipeSchema), asyncHandler(controller.setRecipe));
router.post("/starter-kit", manage, asyncHandler(controller.starterKit));
router.post("/import/scan", manage, uploadStockDocument.single("file"), asyncHandler(controller.scanDocument));
router.post("/import", manage, validateBody(importInventorySchema), asyncHandler(controller.importItems));
router.post("/:id/receive", manage, validateBody(receiveStockSchema), asyncHandler(controller.receive));
router.post("/:id/count", manage, validateBody(countStockSchema), asyncHandler(controller.count));
router.post("/", manage, validateBody(createInventoryItemSchema), asyncHandler(controller.create));
router.patch("/:id", manage, validateBody(updateInventoryItemSchema), asyncHandler(controller.update));
router.delete("/:id", manage, asyncHandler(controller.remove));

export default router;
