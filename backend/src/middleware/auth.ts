import type { NextFunction, Request, Response } from "express";
import type { StaffRole } from "@prisma/client";
import { verifyToken, type TokenPayload } from "../utils/jwt";
import { AppError } from "../utils/AppError";
import { prisma } from "../utils/prisma";

// Deactivated staff are cut off on their next request, not only at their
// next login (tokens last days). Cached briefly so this isn't a DB hit on
// every request; forgetStaffStatus() clears it when an account changes.
const STATUS_TTL_MS = 30_000;
const staffStatus = new Map<string, { active: boolean; at: number }>();

export function forgetStaffStatus(userId: string) {
  staffStatus.delete(userId);
}

async function isStaffActive(userId: string) {
  const hit = staffStatus.get(userId);
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit.active;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { active: true } });
  const active = !!u?.active;
  staffStatus.set(userId, { active, at: Date.now() });
  return active;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError(401, "Missing or invalid Authorization header");
  }
  const token = header.slice("Bearer ".length);
  try {
    req.user = verifyToken(token);
  } catch {
    throw new AppError(401, "Invalid or expired token");
  }
  if (req.user.type !== "staff") return next();
  isStaffActive(req.user.sub)
    .then((ok) => (ok ? next() : next(new AppError(401, "This staff account has been deactivated"))))
    .catch(next);
}

/** Restricts access to authenticated staff whose role is in `roles`. */
export function requireRole(roles: StaffRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || req.user.type !== "staff") {
      throw new AppError(403, "Staff access required");
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, "Insufficient role permissions");
    }
    next();
  };
}

/** Restricts access to any authenticated staff member (any role). */
export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.type !== "staff") {
    throw new AppError(403, "Staff access required");
  }
  next();
}

/** Restricts access to authenticated customers. */
export function requireCustomer(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.type !== "customer") {
    throw new AppError(403, "Customer access required");
  }
  next();
}
