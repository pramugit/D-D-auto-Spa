import { Router } from "express";
import * as controller from "../controllers/customerAuthController";
import { validateBody } from "../middleware/validate";
import { loginSchema, registerCustomerSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

router.post("/register", validateBody(registerCustomerSchema), asyncHandler(controller.register));
router.post("/login", validateBody(loginSchema), asyncHandler(controller.login));

export default router;
