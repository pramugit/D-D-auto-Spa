import { Router } from "express";
import * as controller from "../controllers/bookingController";
import { authenticate, requireRole } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  assignBaySchema,
  availabilityQuerySchema,
  createBookingSchema,
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

router.patch(
  "/:id/status",
  staffOnly,
  validateBody(transitionBookingStatusSchema),
  asyncHandler(controller.updateStatus)
);

router.patch(
  "/:id/assign-bay",
  requireSection("bookings", "edit"),
  validateBody(assignBaySchema),
  asyncHandler(controller.assignBay)
);

router.patch("/:id/claim", staffOnly, asyncHandler(controller.claim));

export default router;
