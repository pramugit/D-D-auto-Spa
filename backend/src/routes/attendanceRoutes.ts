import { Router } from "express";
import * as controller from "../controllers/attendanceController";
import { authenticate, requireRole, requireStaff } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { validateBody } from "../middleware/validate";
import {
  attendanceRecordSchema,
  attendanceRecordUpdateSchema,
  attendanceKioskPunchSchema,
  attendanceKioskExitSchema,
} from "../utils/schemas";

const router = Router();

router.use(authenticate, requireStaff);

// Every role clocks themselves in/out — see permissions.ts's note on
// "attendance" being open to all roles.
router.post("/clock-in", asyncHandler(controller.clockIn));
router.post("/clock-out", asyncHandler(controller.clockOut));
router.get("/me", asyncHandler(controller.listOwn));

// Shared clock-in kiosk. The device itself must be logged in by an
// ADMIN/MANAGER — otherwise anyone signed in on their own phone could
// punch colleagues in or out by code.
const kioskHost = requireRole(["ADMIN", "MANAGER"]);
router.post("/kiosk/punch", kioskHost, validateBody(attendanceKioskPunchSchema), asyncHandler(controller.kioskPunch));
router.post("/kiosk/exit", kioskHost, validateBody(attendanceKioskExitSchema), asyncHandler(controller.kioskVerifyExit));
// The "see everyone's attendance" overview is the actual restricted
// capability — ADMIN/MANAGER only. Not expressed via requireSection:
// the "attendance" section's own view list is deliberately every role
// (so self clock-in/out works for everyone), so a hand-picked role
// check is what actually restricts this endpoint (see the note on this
// carve-out in config/permissions.ts).
router.get("/", requireRole(["ADMIN", "MANAGER"]), asyncHandler(controller.listAll));

// Corrections from the staff profile (missed clock-out, forgotten clock-in).
const managers = requireRole(["ADMIN", "MANAGER"]);
router.post("/records", managers, validateBody(attendanceRecordSchema), asyncHandler(controller.addRecord));
router.patch("/records/:id", managers, validateBody(attendanceRecordUpdateSchema), asyncHandler(controller.updateRecord));
router.delete("/records/:id", managers, asyncHandler(controller.deleteRecord));

export default router;
