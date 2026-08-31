import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

export async function list(_req: Request, res: Response) {
  const categories = await prisma.serviceCategory.findMany({ include: { services: true } });
  res.json(categories);
}

export async function create(req: Request, res: Response) {
  const existing = await prisma.serviceCategory.findUnique({ where: { name: req.body.name } });
  if (existing) throw new AppError(409, "Category already exists");
  const category = await prisma.serviceCategory.create({ data: req.body });
  res.status(201).json(category);
}

export async function remove(req: Request, res: Response) {
  await prisma.serviceCategory.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
