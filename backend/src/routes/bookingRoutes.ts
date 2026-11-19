import { Router } from "express";
import * as controller from "../controllers/bookingController";
import { authenticate, requireCustomer, requireRole } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  assignBaySchema,
  availabilityQuerySchema,
  rescheduleSchema,
  bookingRequestSchema,
  proposeTimeSchema,
  askAnotherTimeSchema,
  scheduleSettingsSchema,
  createBookingSchema,
  createWalkInJobSchema,
  transitionBookingStatusSchema,
} from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
// Broader than the "bookings" section on purpose: attention/status/claim
// are cross-cutting actions also driven from the Job Board (which every
// staff role can at least view) and the job-card timeline (Phase G),
// not exclusively the Bookings section — see bookingService.ts's
// TRANSITION_REQUIRES_ROLE for the finer per-destination-status rules
// layered on top of this broad gate.
const staffOnly = requireRole(["ADMIN", "MANAGER", "RECEPTIONIST", "TECHNICIAN"]);
const canCreateForCustomer = requireSection("bookings", "edit");

router.use(authenticate);

// Not section-gated: needed by both staff creating a booking (Bookings
// section) and the customer portal's own booking flow.
router.get("/availability", validateQuery(availabilityQuerySchema), asyncHandler(controller.availability));
router.get("/attention", staffOnly, asyncHandler(controller.attention));
// Time management (admin schedule views + settings; customers can read the rules).
router.get("/schedule/settings", asyncHandler(controller.scheduleSettings));
router.put(
  "/schedule/settings",
  requireRole(["ADMIN", "MANAGER"]),
  validateBody(scheduleSettingsSchema),
  asyncHandler(controller.saveScheduleSettings)
);
router.get("/schedule/day", requireSection("bookings", "view"), asyncHandler(controller.scheduleDay));
router.get("/schedule/week", requireSection("bookings", "view"), asyncHandler(controller.scheduleWeek));
router.get("/", requireSection("bookings", "view"), asyncHandler(controller.list));
router.get("/:id", requireSection("bookings", "view"), asyncHandler(controller.get));
// Needed by the job-card timeline (Phase G) for every staff role that
// can view a job card, not just the Bookings section — stays open.
router.get("/:id/activity-log", asyncHandler(controller.activityLog));

// A customer books for themselves; staff (front desk) may book on a
// customer's behalf if they have Bookings edit access.
router.post(
  "/",
  (req, res, next) => {
    if (req.user?.type === "customer") return next();
    return canCreateForCustomer(req, res, next);
  },
  validateBody(createBookingSchema),
  asyncHandler(controller.create)
);

// Daily Jobs board's quick-create — same audience as the Job Board itself
// (ADMIN/MANAGER/TECHNICIAN can create; RECEPTIONIST stays view-only there
// too), not the Bookings section's role set.
router.post(
  "/walk-in",
  requireSection("jobBoard", "edit"),
  validateBody(createWalkInJobSchema),
  asyncHandler(controller.createWalkIn)
);

router.patch(
  "/:id/status",
  staffOnly,
  validateBody(transitionBookingStatusSchema),
  asyncHandler(controller.updateStatus)
);

// ── Booking requests ──
// Customer asks (services + preferred dates); staff give a time; customer confirms.
router.post("/request", requireCustomer, validateBody(bookingRequestSchema), asyncHandler(controller.request));
router.patch(
  "/:id/propose-time",
  requireSection("bookings", "edit"),
  validateBody(proposeTimeSchema),
  asyncHandler(controller.proposeTime)
);
router.post("/:id/accept-time", requireCustomer, asyncHandler(controller.acceptTime));
router.post("/:id/ask-another-time", requireCustomer, validateBody(askAnotherTimeSchema), asyncHandler(controller.askAnotherTime));

// Customer self-service cancellation — ownership + allowed-transition
// checks happen in the controller/service, so no role gate here.
router.patch("/:id/cancel", asyncHandler(controller.cancel));

// Move to a new time — staff with Bookings edit access, or the customer
// (ownership + change window checked in the service).
router.patch(
  "/:id/reschedule",
  (req, res, next) => (req.user?.type === "customer" ? next() : requireSection("bookings", "edit")(req, res, next)),
  validateBody(rescheduleSchema),
  asyncHandler(controller.reschedule)
);

router.patch(
  "/:id/assign-bay",
  requireSection("bookings", "edit"),
  validateBody(assignBaySchema),
  asyncHandler(controller.assignBay)
);

router.patch("/:id/claim", staffOnly, asyncHandler(controller.claim));

export default router;
