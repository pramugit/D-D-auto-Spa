import { Router } from "express";
import * as controller from "../controllers/reportController";
import { authenticate, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

router.use(authenticate, requireRole(["ADMIN"]));

router.get("/revenue", asyncHandler(controller.revenue));
router.get("/top-services", asyncHandler(controller.topServices));
router.get("/technicians", asyncHandler(controller.technicians));
router.get("/bay-utilization", asyncHandler(controller.bayUtilization));
router.get("/repeat-customers", asyncHandler(controller.repeatCustomers));

export default router;
