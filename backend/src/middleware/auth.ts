import type { NextFunction, Request, Response } from "express";
import type { StaffRole } from "@prisma/client";
import { verifyToken, type TokenPayload } from "../utils/jwt";
import { AppError } from "../utils/AppError";

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
  next();
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
