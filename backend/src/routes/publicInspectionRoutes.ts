import { Router } from "express";
import * as controller from "../controllers/damageInspectionController";
import { validateBody } from "../middleware/validate";
import { inspectionResponseSchema } from "../utils/schemas";
import { asyncHandler } from "../middleware/errorHandler";

// No authentication: the customer opens these from a WhatsApp link. The
// unguessable approval token (see damageInspectionService) is the only
// credential, and it only reaches this one inspection.
const router = Router();

router.get("/:token", asyncHandler(controller.getPublic));
router.post("/:token/respond", validateBody(inspectionResponseSchema), asyncHandler(controller.respondPublic));

export default router;
