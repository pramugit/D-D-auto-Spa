import { Router } from "express";
import * as controller from "../controllers/userController";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createUserSchema, updateUserSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const adminOnly = requireRole(["ADMIN"]);

router.use(authenticate, adminOnly);
router.get("/", asyncHandler(controller.list));
router.get("/:id", asyncHandler(controller.get));
router.post("/", validateBody(createUserSchema), asyncHandler(controller.create));
router.patch("/:id", validateBody(updateUserSchema), asyncHandler(controller.update));
router.delete("/:id", asyncHandler(controller.remove));

export default router;
