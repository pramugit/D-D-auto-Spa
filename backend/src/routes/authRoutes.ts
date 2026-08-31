import { Router } from "express";
import * as authController from "../controllers/authController";
import { validateBody } from "../middleware/validate";
import { loginSchema, registerStaffSchema } from "../utils/schemas";
import { bootstrapOrAdmin } from "../middleware/bootstrapOrAdmin";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

router.post("/register", bootstrapOrAdmin, validateBody(registerStaffSchema), asyncHandler(authController.register));
router.post("/login", validateBody(loginSchema), asyncHandler(authController.login));
router.get("/me", authenticate, asyncHandler(authController.me));

export default router;
