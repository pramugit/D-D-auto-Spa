import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

export async function list(_req: Request, res: Response) {
  const bays = await prisma.bay.findMany({ orderBy: { name: "asc" } });
  res.json(bays);
}

export async function create(req: Request, res: Response) {
  const bay = await prisma.bay.create({ data: req.body });
  res.status(201).json(bay);
}

export async function update(req: Request, res: Response) {
  const bay = await prisma.bay.update({ where: { id: req.params.id }, data: req.body });
  res.json(bay);
}

export async function remove(req: Request, res: Response) {
  const inUse = await prisma.booking.findFirst({
    where: { bayId: req.params.id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
  });
  if (inUse) throw new AppError(409, "Bay has active bookings and cannot be deleted");
  await prisma.bay.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
