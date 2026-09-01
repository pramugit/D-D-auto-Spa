import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { canEdit, canView, type PermissionSection } from "../config/permissions";

/**
 * Like requireSection, but passes if the caller has the given access to
 * ANY of the listed (section, mode) pairs — for the handful of endpoints
 * that are legitimately shared between two sections (e.g. the inventory
 * item list, needed by both the Inventory section itself and by
 * TECHNICIAN's Job Board job-card page for its "item used" dropdown).
 * Keeps the gate derived from the config instead of a hand-written role
 * array, so changing either section's entry still propagates here.
 */
export function requireAnySection(...checks: [PermissionSection, "view" | "edit"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError(401, "Authentication required");
    const user = req.user;
    if (user.type === "customer") return next();

    const allowed = checks.some(([section, mode]) =>
      mode === "edit" ? canEdit(user.role, section) : canView(user.role, section)
    );
    if (!allowed) {
      const desc = checks.map(([s, m]) => `${m} ${s}`).join(" or ");
      throw new AppError(403, `${user.role} does not have ${desc} access`);
    }
    next();
  };
}

/**
 * Section-level gate driven by the single permissions matrix
 * (config/permissions.ts) — use this instead of a hand-written
 * requireRole([...]) array wherever a route maps onto one of the 8
 * sections, so a permission change only ever needs to happen in one
 * place. Customer-type callers always pass through: sections are a
 * staff concept, customer routes scope themselves by ownership.
 */
export function requireSection(section: PermissionSection, mode: "view" | "edit" = "view") {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError(401, "Authentication required");
    if (req.user.type === "customer") return next();

    const allowed = mode === "edit" ? canEdit(req.user.role, section) : canView(req.user.role, section);
    if (!allowed) {
      throw new AppError(403, `${req.user.role} does not have ${mode} access to ${section}`);
    }
    next();
  };
}
