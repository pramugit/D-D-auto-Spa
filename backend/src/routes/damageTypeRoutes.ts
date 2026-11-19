import { Router } from "express";
import * as controller from "../controllers/damageTypeController";
import { authenticate } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { validateBody } from "../middleware/validate";
import { createDamageTypeSchema, updateDamageTypeSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const manage = requireSection("damageTypes", "edit");

router.use(authenticate);

// GET is a shared utility, same carve-out as "list services"/"list
// inventory items" — any staff who can edit the Job Board (including
// TECHNICIAN) needs this to populate a marking's damage-type dropdown,
// not just ADMIN/MANAGER who manage the catalog itself.
router.get("/", asyncHandler(controller.list));
router.post("/", manage, validateBody(createDamageTypeSchema), asyncHandler(controller.create));
router.patch("/:id", manage, validateBody(updateDamageTypeSchema), asyncHandler(controller.update));
router.delete("/:id", manage, asyncHandler(controller.remove));

export default router;
