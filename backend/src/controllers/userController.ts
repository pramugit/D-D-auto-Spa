import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

const publicSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  hourlyRate: true,
  createdAt: true,
};

export async function list(_req: Request, res: Response) {
  const users = await prisma.user.findMany({ select: publicSelect, orderBy: { name: "asc" } });
  res.json(users);
}

/**
 * Just id/name/role for TECHNICIAN-role users — the "assign technician"
 * checklist on a job card needs this regardless of whether the caller
 * can see the Staff section (a technician assigning/reassigning their
 * own job, or a receptionist... no, receptionist can't edit Job Board;
 * but ADMIN/MANAGER/TECHNICIAN all can, and none of that maps cleanly
 * onto staff.view=[ADMIN,MANAGER]). Kept separate from the full staff
 * roster endpoint rather than loosening that one's permissions.
 */
export async function listTechnicians(_req: Request, res: Response) {
  const technicians = await prisma.user.findMany({
    where: { role: "TECHNICIAN" },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  res.json(technicians);
}

export async function get(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: publicSelect });
  if (!user) throw new AppError(404, "User not found");
  res.json(user);
}

export async function create(req: Request, res: Response) {
  const { password, ...data } = req.body;
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError(409, "A staff account with this email already exists");
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { ...data, passwordHash },
    select: publicSelect,
  });
  res.status(201).json(user);
}

export async function update(req: Request, res: Response) {
  const { password, ...data } = req.body;
  const updateData: Record<string, unknown> = { ...data };
  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, 10);
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: updateData,
    select: publicSelect,
  });
  res.json(user);
}

export async function remove(req: Request, res: Response) {
  await prisma.user.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
