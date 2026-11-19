import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { safeCustomerSelect } from "../utils/prismaSelects";

const customerSelect = { ...safeCustomerSelect, vehicles: true } as const;

export async function list(req: Request, res: Response) {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const customers = await prisma.customer.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    select: customerSelect,
  });
  res.json(customers);
}

export async function get(req: Request, res: Response) {
  if (req.user?.type === "customer" && req.user.sub !== req.params.id) {
    throw new AppError(403, "Not your customer record");
  }
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    select: customerSelect,
  });
  if (!customer) throw new AppError(404, "Customer not found");
  res.json(customer);
}

export async function create(req: Request, res: Response) {
  const customer = await prisma.customer.create({ data: req.body, select: customerSelect });
  res.status(201).json(customer);
}

export async function update(req: Request, res: Response) {
  if (req.user?.type === "customer" && req.user.sub !== req.params.id) {
    throw new AppError(403, "Not your customer record");
  }
  const customer = await prisma.customer.update({
    where: { id: req.params.id },
    data: req.body,
    select: customerSelect,
  });
  res.json(customer);
}

export async function remove(req: Request, res: Response) {
  await prisma.customer.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

export async function getLoyalty(req: Request, res: Response) {
  if (req.user?.type === "customer" && req.user.sub !== req.params.id) {
    throw new AppError(403, "Not your loyalty account");
  }
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, loyaltyPoints: true },
  });
  if (!customer) throw new AppError(404, "Customer not found");
  res.json(customer);
}

// ---- nested vehicles ----

export async function listVehicles(req: Request, res: Response) {
  if (req.user?.type === "customer" && req.user.sub !== req.params.id) {
    throw new AppError(403, "Not your vehicles");
  }
  const vehicles = await prisma.vehicle.findMany({
    where: { customerId: req.params.id },
  });
  res.json(vehicles);
}

export async function createVehicle(req: Request, res: Response) {
  if (req.user?.type === "customer" && req.user.sub !== req.params.id) {
    throw new AppError(403, "Not your customer record");
  }
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) throw new AppError(404, "Customer not found");
  const vehicle = await prisma.vehicle.create({
    data: { ...req.body, customerId: req.params.id },
  });
  res.status(201).json(vehicle);
}

async function findOwnedVehicle(req: Request) {
  if (req.user?.type === "customer" && req.user.sub !== req.params.id) {
    throw new AppError(403, "Not your customer record");
  }
  const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.vehicleId } });
  if (!vehicle || vehicle.customerId !== req.params.id) {
    throw new AppError(404, "Vehicle not found");
  }
  return vehicle;
}

export async function updateVehicle(req: Request, res: Response) {
  await findOwnedVehicle(req);
  const vehicle = await prisma.vehicle.update({
    where: { id: req.params.vehicleId },
    data: req.body,
  });
  res.json(vehicle);
}

export async function removeVehicle(req: Request, res: Response) {
  await findOwnedVehicle(req);
  const inUse = await prisma.booking.findFirst({ where: { vehicleId: req.params.vehicleId } });
  if (inUse) throw new AppError(409, "Vehicle has booking history and cannot be deleted");
  await prisma.vehicle.delete({ where: { id: req.params.vehicleId } });
  res.status(204).send();
}
