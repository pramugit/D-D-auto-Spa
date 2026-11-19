import { Router } from "express";
import * as controller from "../controllers/userController";
import { authenticate } from "../middleware/auth";
import { requireAnySection, requireSection } from "../middleware/permissions";
import { validateBody } from "../middleware/validate";
import { createUserSchema, updateUserSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const viewStaff = requireSection("staff", "view"); // ADMIN + MANAGER (read-only)
const editStaff = requireSection("staff", "edit"); // ADMIN only

router.use(authenticate);
// Narrow technician roster for the Job Board's "assign technician"
// checklist — needed by anyone who can edit Job Board (includes
// TECHNICIAN, who can't see the full Staff section). Registered before
// "/:id" so it isn't swallowed by that param route.
router.get(
  "/technicians",
  requireAnySection(["staff", "view"], ["jobBoard", "edit"]),
  asyncHandler(controller.listTechnicians)
);
router.get("/", viewStaff, asyncHandler(controller.list));
router.get("/overview", viewStaff, asyncHandler(controller.overview));
router.get("/:id/profile", viewStaff, asyncHandler(controller.profile));
router.get("/:id", viewStaff, asyncHandler(controller.get));
router.post("/", editStaff, validateBody(createUserSchema), asyncHandler(controller.create));
router.patch("/:id", editStaff, validateBody(updateUserSchema), asyncHandler(controller.update));
router.delete("/:id", editStaff, asyncHandler(controller.remove));

export default router;
