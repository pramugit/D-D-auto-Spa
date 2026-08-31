import type { NextFunction, Request, Response } from "express";
import { isBootstrapNeeded } from "../services/authService";
import { authenticate, requireRole } from "./auth";
import { asyncHandler } from "./errorHandler";

/**
 * Staff registration is open only to create the very first (admin) account.
 * After that, only an authenticated ADMIN may register more staff.
 */
export const bootstrapOrAdmin = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (await isBootstrapNeeded()) {
    return next();
  }
  authenticate(req, res, () => requireRole(["ADMIN"])(req, res, next));
});
