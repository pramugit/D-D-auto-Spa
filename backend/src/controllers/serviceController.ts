import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

export async function list(req: Request, res: Response) {
  const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
  const activeOnly = req.query.active === "true";
  const services = await prisma.service.findMany({
    where: {
      categoryId,
      active: activeOnly ? true : undefined,
    },
    include: { pricing: true, category: true },
    orderBy: { name: "asc" },
  });
  res.json(services);
}

export async function get(req: Request, res: Response) {
  const service = await prisma.service.findUnique({
    where: { id: req.params.id },
    include: { pricing: true, category: true },
  });
  if (!service) throw new AppError(404, "Service not found");
  res.json(service);
}

export async function create(req: Request, res: Response) {
  const { pricing, ...data } = req.body;
  const service = await prisma.service.create({
    data: {
      ...data,
      pricing: { create: pricing },
    },
    include: { pricing: true },
  });
  res.status(201).json(service);
}

export async function update(req: Request, res: Response) {
  const { pricing, ...data } = req.body;
  const service = await prisma.$transaction(async (tx) => {
    if (pricing) {
      await tx.servicePricing.deleteMany({ where: { serviceId: req.params.id } });
      await tx.servicePricing.createMany({
        data: pricing.map((p: { vehicleType: string; price: number }) => ({
          ...p,
          serviceId: req.params.id,
        })),
      });
    }
    return tx.service.update({
      where: { id: req.params.id },
      data,
      include: { pricing: true },
    });
  });
  res.json(service);
}

export async function remove(req: Request, res: Response) {
  await prisma.service.update({ where: { id: req.params.id }, data: { active: false } });
  res.status(204).send();
}
