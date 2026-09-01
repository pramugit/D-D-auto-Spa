import { Router } from "express";
import * as controller from "../controllers/bookingController";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  assignBaySchema,
  availabilityQuerySchema,
  createBookingSchema,
  transitionBookingStatusSchema,
} from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const staffOnly = requireRole(["ADMIN", "MANAGER", "RECEPTIONIST", "TECHNICIAN"]);
const canCreateForCustomer = requireRole(["ADMIN", "MANAGER", "RECEPTIONIST"]);

router.use(authenticate);

router.get("/availability", validateQuery(availabilityQuerySchema), asyncHandler(controller.availability));
router.get("/attention", staffOnly, asyncHandler(controller.attention));
router.get("/", asyncHandler(controller.list));
router.get("/:id", asyncHandler(controller.get));
router.get("/:id/activity-log", asyncHandler(controller.activityLog));

// A customer books for themselves; staff (front desk) may book on a
// customer's behalf by supplying customerId in the body.
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
  requireRole(["ADMIN", "MANAGER", "RECEPTIONIST"]),
  validateBody(assignBaySchema),
  asyncHandler(controller.assignBay)
);

router.patch("/:id/claim", staffOnly, asyncHandler(controller.claim));

export default router;
