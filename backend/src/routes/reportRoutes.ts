import { Router } from "express";
import * as controller from "../controllers/reportController";
import { authenticate, requireRole } from "../middleware/auth";
import { requireSection } from "../middleware/permissions";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
// The original Reports page (revenue/top-services/technicians/bay-
// utilization/repeat-customers) is its own admin-only screen, not one
// of the permissions matrix's 8 sections — stays an explicit rule.
const adminOnly = requireRole(["ADMIN"]);
const opsDashboard = requireSection("opsDashboard", "view");

router.use(authenticate);

router.get("/revenue", adminOnly, asyncHandler(controller.revenue));
router.get("/top-services", adminOnly, asyncHandler(controller.topServices));
router.get("/technicians", adminOnly, asyncHandler(controller.technicians));
router.get("/bay-utilization", adminOnly, asyncHandler(controller.bayUtilization));
router.get("/repeat-customers", adminOnly, asyncHandler(controller.repeatCustomers));

// These three back the Phase H Ops Dashboard, so they're gated by that
// section instead.
router.get("/profit", opsDashboard, asyncHandler(controller.profit));
router.get("/satisfaction", opsDashboard, asyncHandler(controller.satisfaction));
router.get("/satisfaction-alerts", opsDashboard, asyncHandler(controller.satisfactionAlerts));

export default router;
