import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import * as attendanceService from "../services/attendanceService";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

export async function kioskPunch(req: Request, res: Response) {
  const { code, action } = req.body as { code: string; action: "in" | "out" };
  res.json(await attendanceService.kioskPunch(code, action));
}

/** Leaving kiosk mode needs the logged-in manager's password, so staff at the kiosk can't walk into the admin app. */
export async function kioskVerifyExit(req: Request, res: Response) {
  const account = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  if (!(await bcrypt.compare(req.body.password, account.passwordHash))) throw new AppError(401, "Incorrect password");
  res.json({ ok: true });
}

export async function clockIn(req: Request, res: Response) {
  const record = await attendanceService.clockIn(req.user!.sub);
  res.status(201).json(record);
}

export async function clockOut(req: Request, res: Response) {
  const record = await attendanceService.clockOut(req.user!.sub);
  res.json(record);
}

export async function listOwn(req: Request, res: Response) {
  const records = await attendanceService.listOwn(req.user!.sub);
  res.json(records);
}

export async function listAll(_req: Request, res: Response) {
  const records = await attendanceService.listAll();
  res.json(records);
}

export async function addRecord(req: Request, res: Response) {
  const { userId, clockIn, clockOut } = req.body as { userId: string; clockIn: Date; clockOut?: Date | null };
  res.status(201).json(await attendanceService.addRecord(userId, clockIn, clockOut ?? null));
}

export async function updateRecord(req: Request, res: Response) {
  const { clockIn, clockOut } = req.body as { clockIn: Date; clockOut?: Date | null };
  res.json(await attendanceService.updateRecord(req.params.id, clockIn, clockOut ?? null));
}

export async function deleteRecord(req: Request, res: Response) {
  await attendanceService.deleteRecord(req.params.id);
  res.status(204).send();
}
