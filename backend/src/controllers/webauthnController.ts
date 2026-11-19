import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { signInventoryUnlock } from "../utils/inventoryUnlock";
import * as webauthnService from "../services/webauthnService";

function requireStaffUser(req: Request) {
  if (!req.user || req.user.type !== "staff") throw new AppError(403, "Staff access required");
  return req.user;
}

export async function registrationOptions(req: Request, res: Response) {
  const user = requireStaffUser(req);
  const account = await prisma.user.findUniqueOrThrow({ where: { id: user.sub } });
  const options = await webauthnService.getRegistrationOptions(user.sub, account.email, account.name);
  res.json(options);
}

export async function registrationVerify(req: Request, res: Response) {
  const user = requireStaffUser(req);
  await webauthnService.verifyRegistration(user.sub, req.body.deviceName, req.body.response);
  res.status(201).json({ ok: true });
}

export async function listCredentials(req: Request, res: Response) {
  const user = requireStaffUser(req);
  const credentials = await webauthnService.listCredentials(user.sub);
  res.json(credentials);
}

export async function removeCredential(req: Request, res: Response) {
  const user = requireStaffUser(req);
  await webauthnService.removeCredential(user.sub, req.params.id);
  res.status(204).send();
}

export async function unlockOptions(req: Request, res: Response) {
  const user = requireStaffUser(req);
  const options = await webauthnService.getUnlockOptions(user.sub);
  res.json(options);
}

export async function unlockVerify(req: Request, res: Response) {
  const user = requireStaffUser(req);
  await webauthnService.verifyUnlock(user.sub, req.body.response);
  res.json(signInventoryUnlock(user.sub));
}

export async function unlockWithPassword(req: Request, res: Response) {
  const user = requireStaffUser(req);
  const account = await prisma.user.findUniqueOrThrow({ where: { id: user.sub } });
  const valid = await bcrypt.compare(req.body.password, account.passwordHash);
  if (!valid) throw new AppError(401, "Incorrect password");
  res.json(signInventoryUnlock(user.sub));
}

// ---- 4-digit Inventory PIN ----

// After this many consecutive wrong PINs, PIN unlock is refused until
// the PIN is reset with the account password ("Forgot PIN?"). Ten
// thousand combinations is only safe with a cap like this.
const MAX_PIN_ATTEMPTS = 5;

export async function pinStatus(req: Request, res: Response) {
  const user = requireStaffUser(req);
  const account = await prisma.user.findUniqueOrThrow({ where: { id: user.sub } });
  res.json({
    hasPin: account.inventoryPinHash !== null,
    blocked: account.inventoryPinFailedAttempts >= MAX_PIN_ATTEMPTS,
  });
}

export async function unlockWithPin(req: Request, res: Response) {
  const user = requireStaffUser(req);
  const account = await prisma.user.findUniqueOrThrow({ where: { id: user.sub } });
  if (!account.inventoryPinHash) throw new AppError(400, "No PIN set yet — create one first");
  if (account.inventoryPinFailedAttempts >= MAX_PIN_ATTEMPTS) {
    throw new AppError(423, "Too many wrong attempts — use “Forgot PIN?” to reset it");
  }
  const valid = await bcrypt.compare(req.body.pin, account.inventoryPinHash);
  if (!valid) {
    const updated = await prisma.user.update({
      where: { id: user.sub },
      data: { inventoryPinFailedAttempts: { increment: 1 } },
    });
    const left = MAX_PIN_ATTEMPTS - updated.inventoryPinFailedAttempts;
    throw new AppError(
      401,
      left > 0
        ? `Incorrect PIN — ${left} attempt${left === 1 ? "" : "s"} left`
        : "Too many wrong attempts — use “Forgot PIN?” to reset it",
    );
  }
  if (account.inventoryPinFailedAttempts > 0) {
    await prisma.user.update({ where: { id: user.sub }, data: { inventoryPinFailedAttempts: 0 } });
  }
  res.json(signInventoryUnlock(user.sub));
}

/**
 * Sets (first time), changes, or resets a forgotten PIN. The account
 * password is the proof in every case, so "Forgot PIN?" needs nothing
 * extra. Clears the wrong-attempt counter and unlocks straight away.
 */
export async function setPin(req: Request, res: Response) {
  const user = requireStaffUser(req);
  const account = await prisma.user.findUniqueOrThrow({ where: { id: user.sub } });
  const valid = await bcrypt.compare(req.body.password, account.passwordHash);
  if (!valid) throw new AppError(401, "Incorrect password");
  await prisma.user.update({
    where: { id: user.sub },
    data: { inventoryPinHash: await bcrypt.hash(req.body.pin, 10), inventoryPinFailedAttempts: 0 },
  });
  res.json(signInventoryUnlock(user.sub));
}
