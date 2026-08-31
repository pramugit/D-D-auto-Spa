import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

export async function list(_req: Request, res: Response) {
  const items = await prisma.inventoryItem.findMany({ orderBy: { name: "asc" } });
  res.json(items);
}

export async function create(req: Request, res: Response) {
  const item = await prisma.inventoryItem.create({ data: req.body });
  res.status(201).json(item);
}

export async function update(req: Request, res: Response) {
  const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: req.body });
  res.json(item);
}

export async function remove(req: Request, res: Response) {
  await prisma.inventoryItem.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

export async function recordUsage(req: Request, res: Response) {
  const { itemId, quantityUsed } = req.body as { itemId: string; quantityUsed: number };

  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) throw new AppError(404, "Inventory item not found");
  if (Number(item.quantityInStock) < quantityUsed) {
    throw new AppError(400, `Insufficient stock: ${item.name} has ${item.quantityInStock} ${item.unit} remaining`);
  }

  const [usage, updatedItem] = await prisma.$transaction([
    prisma.inventoryUsage.create({
      data: { jobCardId: req.params.id, itemId, quantityUsed },
    }),
    prisma.inventoryItem.update({
      where: { id: itemId },
      data: { quantityInStock: { decrement: quantityUsed } },
    }),
  ]);

  const lowStock = Number(updatedItem.quantityInStock) <= Number(updatedItem.reorderLevel);

  res.status(201).json({
    usage,
    item: updatedItem,
    lowStockWarning: lowStock
      ? `${updatedItem.name} is at or below its reorder level (${updatedItem.quantityInStock} ${updatedItem.unit} remaining, reorder at ${updatedItem.reorderLevel})`
      : null,
  });
}
