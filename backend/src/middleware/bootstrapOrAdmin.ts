import type { NextFunction, Request, Response } from "express";
import { isBootstrapNeeded } from "../services/authService";
import { authenticate } from "./auth";
import { requireSection } from "./permissions";
import { asyncHandler } from "./errorHandler";

/**
 * Staff registration is open only to create the very first (admin) account.
 * After that, this is the same "create a staff account" action as
 * POST /users, so it's gated the same way — staff.edit (ADMIN only).
 */
export const bootstrapOrAdmin = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (await isBootstrapNeeded()) {
    return next();
  }
  authenticate(req, res, () => requireSection("staff", "edit")(req, res, next));
});
