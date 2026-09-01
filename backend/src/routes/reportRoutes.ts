import { Router } from "express";
import * as controller from "../controllers/reportController";
import { authenticate, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const adminOnly = requireRole(["ADMIN"]);
const managerAndAbove = requireRole(["ADMIN", "MANAGER"]);

router.use(authenticate);

router.get("/revenue", adminOnly, asyncHandler(controller.revenue));
router.get("/top-services", adminOnly, asyncHandler(controller.topServices));
router.get("/technicians", adminOnly, asyncHandler(controller.technicians));
router.get("/bay-utilization", adminOnly, asyncHandler(controller.bayUtilization));
router.get("/repeat-customers", adminOnly, asyncHandler(controller.repeatCustomers));

// Financially sensitive but needed by the Phase H manager dashboard, so
// MANAGER can see it too (unlike the admin-only set above).
router.get("/profit", managerAndAbove, asyncHandler(controller.profit));

export default router;
