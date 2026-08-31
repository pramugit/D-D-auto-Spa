import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

export async function list(_req: Request, res: Response) {
  const packages = await prisma.servicePackage.findMany({
    include: { services: { include: { service: true } } },
    orderBy: { name: "asc" },
  });
  res.json(packages);
}

export async function get(req: Request, res: Response) {
  const pkg = await prisma.servicePackage.findUnique({
    where: { id: req.params.id },
    include: { services: { include: { service: true } } },
  });
  if (!pkg) throw new AppError(404, "Service package not found");
  res.json(pkg);
}

export async function create(req: Request, res: Response) {
  const { serviceIds, ...data } = req.body;
  const pkg = await prisma.servicePackage.create({
    data: {
      ...data,
      services: { create: serviceIds.map((serviceId: string) => ({ serviceId })) },
    },
    include: { services: { include: { service: true } } },
  });
  res.status(201).json(pkg);
}

export async function update(req: Request, res: Response) {
  const { serviceIds, ...data } = req.body;
  const pkg = await prisma.$transaction(async (tx) => {
    if (serviceIds) {
      await tx.servicePackageService.deleteMany({ where: { packageId: req.params.id } });
      await tx.servicePackageService.createMany({
        data: serviceIds.map((serviceId: string) => ({ packageId: req.params.id, serviceId })),
      });
    }
    return tx.servicePackage.update({
      where: { id: req.params.id },
      data,
      include: { services: { include: { service: true } } },
    });
  });
  res.json(pkg);
}

export async function remove(req: Request, res: Response) {
  await prisma.servicePackage.update({ where: { id: req.params.id }, data: { active: false } });
  res.status(204).send();
}
