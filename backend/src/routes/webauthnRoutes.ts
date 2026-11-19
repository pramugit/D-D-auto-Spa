import { Router } from "express";
import * as controller from "../controllers/webauthnController";
import { authenticate, requireStaff } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import {
  webauthnRegisterVerifySchema,
  webauthnUnlockVerifySchema,
  webauthnUnlockPasswordSchema,
  inventoryPinUnlockSchema,
  inventoryPinSetSchema,
} from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

router.use(authenticate, requireStaff);

// Device management — any staff member manages their own devices,
// regardless of Inventory access (registering a device is separate from
// being allowed into the section it later unlocks).
router.post("/register/options", asyncHandler(controller.registrationOptions));
router.post("/register/verify", validateBody(webauthnRegisterVerifySchema), asyncHandler(controller.registrationVerify));
router.get("/credentials", asyncHandler(controller.listCredentials));
router.delete("/credentials/:id", asyncHandler(controller.removeCredential));

// The unlock ceremony itself — issues a short-lived inventory-unlock
// token (see utils/inventoryUnlock.ts) consumed by
// middleware/inventoryUnlock.ts on the gated Inventory routes.
router.post("/unlock/options", asyncHandler(controller.unlockOptions));
router.post("/unlock/verify", validateBody(webauthnUnlockVerifySchema), asyncHandler(controller.unlockVerify));
router.post("/unlock/password", validateBody(webauthnUnlockPasswordSchema), asyncHandler(controller.unlockWithPassword));

// 4-digit PIN — the primary unlock. Setting/resetting it needs the
// account password; that is the "Forgot PIN?" path.
router.get("/pin", asyncHandler(controller.pinStatus));
router.post("/pin", validateBody(inventoryPinSetSchema), asyncHandler(controller.setPin));
router.post("/unlock/pin", validateBody(inventoryPinUnlockSchema), asyncHandler(controller.unlockWithPin));

export default router;
