import { Router } from "express";
import * as controller from "../controllers/customerAuthController";
import { authenticate, requireCustomer } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { changeCustomerPasswordSchema, loginSchema, registerCustomerSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

router.post("/register", validateBody(registerCustomerSchema), asyncHandler(controller.register));
router.post("/login", validateBody(loginSchema), asyncHandler(controller.login));
router.patch(
  "/change-password",
  authenticate,
  requireCustomer,
  validateBody(changeCustomerPasswordSchema),
  asyncHandler(controller.changePassword)
);

export default router;
