import { Router } from "express";
import * as controller from "../controllers/bankAccountController";
import { authenticate, requireRole } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { validateBody } from "../middleware/validate";
import { createBankAccountSchema, updateBankAccountSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
// Stricter than invoicesPayments.edit (which includes RECEPTIONIST) —
// managing where customer money gets sent is a fraud-prevention checkpoint,
// same reasoning as payment verification, so it stays its own explicit rule.
const manage = requireRole(["ADMIN", "MANAGER"]);

router.use(authenticate);

// GET is shared with the customer portal (a customer picking bank transfer
// needs to see where to send money), so it's gated by invoicesPayments.view
// rather than staff-only — requireSection already passes customer callers
// through, and the controller itself forces active-only for them.
router.get("/", requireSection("invoicesPayments", "view"), asyncHandler(controller.list));
router.post("/", manage, validateBody(createBankAccountSchema), asyncHandler(controller.create));
router.patch("/:id", manage, validateBody(updateBankAccountSchema), asyncHandler(controller.update));
router.delete("/:id", manage, asyncHandler(controller.remove));

export default router;
