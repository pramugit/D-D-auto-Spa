import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { verifyInventoryUnlock } from "../utils/inventoryUnlock";

/**
 * Extra layer on top of the normal Inventory section permission
 * (config/permissions.ts) — proves the caller unlocked Inventory with
 * their fingerprint/passkey (or password fallback) in the last 30
 * minutes (see utils/inventoryUnlock.ts), via the X-Inventory-Unlock
 * header. A missing/expired/foreign token is a 401 (not 403, since it's
 * "prove who you are again," not "you're not allowed") — the frontend
 * treats any 401 from a gated Inventory route as "show the unlock
 * screen again."
 */
export function requireInventoryUnlock(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.type !== "staff") throw new AppError(403, "Staff access required");
  const header = req.headers["x-inventory-unlock"];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) throw new AppError(401, "Inventory unlock required");
  try {
    verifyInventoryUnlock(token, req.user.sub);
  } catch {
    throw new AppError(401, "Inventory unlock required");
  }
  next();
}
