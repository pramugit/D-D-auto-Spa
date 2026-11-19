import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

export async function list(_req: Request, res: Response) {
  const types = await prisma.damageType.findMany({ orderBy: { name: "asc" } });
  res.json(types);
}

export async function create(req: Request, res: Response) {
  const type = await prisma.damageType.create({ data: req.body });
  res.status(201).json(type);
}

export async function update(req: Request, res: Response) {
  const type = await prisma.damageType.update({ where: { id: req.params.id }, data: req.body });
  res.json(type);
}

export async function remove(req: Request, res: Response) {
  const inUse = await prisma.damageMarking.findFirst({ where: { damageTypeId: req.params.id } });
  if (inUse) throw new AppError(409, "This damage type is used by existing markings and can't be deleted");
  await prisma.damageType.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
