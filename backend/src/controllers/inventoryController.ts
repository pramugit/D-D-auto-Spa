import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { recalculateInvoiceIfExists } from "../services/invoiceService";
import * as inventory from "../services/inventoryService";
import { scanStockDocument } from "../services/inventoryScanService";

const staffId = (req: Request) => (req.user?.type === "staff" ? req.user.sub : null);

export async function list(_req: Request, res: Response) {
  const items = await prisma.inventoryItem.findMany({ orderBy: { name: "asc" } });
  res.json(items);
}

export async function overview(_req: Request, res: Response) {
  res.json(await inventory.getOverview());
}

export async function create(req: Request, res: Response) {
  const item = await inventory.createItem(req.body, staffId(req)!);
  res.status(201).json(item);
}

/** Details only — stock levels change through receive / count / job usage so every change is logged. */
export async function update(req: Request, res: Response) {
  const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: req.body });
  res.json(item);
}

export async function remove(req: Request, res: Response) {
  const used = await prisma.inventoryUsage.count({ where: { itemId: req.params.id } });
  if (used > 0) {
    throw new AppError(
      409,
      "This item has been used on jobs, so it can't be deleted (that would break job costs). Count its stock to 0 instead."
    );
  }
  await prisma.inventoryItem.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

export async function receive(req: Request, res: Response) {
  const { quantity, unitCost, note } = req.body as { quantity: number; unitCost?: number; note?: string };
  res.json(await inventory.receiveStock(req.params.id, quantity, unitCost, note, staffId(req)!));
}

export async function count(req: Request, res: Response) {
  const { counted, note } = req.body as { counted: number; note?: string };
  res.json(await inventory.countStock(req.params.id, counted, note, staffId(req)!));
}

export async function movements(req: Request, res: Response) {
  const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  res.json(await inventory.listMovements(itemId, limit));
}

export async function recipes(_req: Request, res: Response) {
  res.json(await inventory.listRecipes());
}

export async function setRecipe(req: Request, res: Response) {
  await inventory.setRecipe(req.params.serviceId, (req.body as { items: { itemId: string; quantity: number }[] }).items);
  res.json(await inventory.listRecipes());
}

export async function starterKit(_req: Request, res: Response) {
  res.json(await inventory.installStarterKit());
}

export async function recordUsage(req: Request, res: Response) {
  const { itemId, quantityUsed, sourceType, externalName, externalCost, externalVendorNote } = req.body as {
    itemId?: string;
    quantityUsed: number;
    sourceType?: "INTERNAL_STOCK" | "EXTERNAL_PURCHASE";
    externalName?: string;
    externalCost?: number;
    externalVendorNote?: string;
  };

  // Bought specifically for this job because the requested quantity
  // exceeded on-hand stock — no InventoryItem, no stock to decrement,
  // billed straight to the customer (see invoiceService).
  if (sourceType === "EXTERNAL_PURCHASE") {
    const usage = await prisma.inventoryUsage.create({
      data: {
        jobCardId: req.params.id,
        quantityUsed,
        sourceType: "EXTERNAL_PURCHASE",
        externalName,
        externalCost,
        externalVendorNote,
      },
    });
    await recalculateInvoiceIfExists(req.params.id);
    res.status(201).json({ usage, item: null, lowStockWarning: null });
    return;
  }

  const { usage, item: updatedItem } = await inventory.recordJobUsage(req.params.id, itemId!, quantityUsed, staffId(req));
  const lowStock = Number(updatedItem.quantityInStock) <= Number(updatedItem.reorderLevel);

  res.status(201).json({
    usage,
    item: updatedItem,
    lowStockWarning: lowStock
      ? `${updatedItem.name} is at or below its reorder level (${updatedItem.quantityInStock} ${updatedItem.unit} remaining, reorder at ${updatedItem.reorderLevel})`
      : null,
  });
}

/** Removes a usage line from a job; stock items go back into stock. */
export async function removeUsage(req: Request, res: Response) {
  const item = await inventory.removeJobUsage(req.params.id, req.params.usageId, staffId(req));
  await recalculateInvoiceIfExists(req.params.id);
  res.json({ item });
}

/** PDF/photo → rows for the import preview (nothing is saved). */
export async function scanDocument(req: Request, res: Response) {
  if (!req.file) throw new AppError(400, "Choose a PDF or photo to scan");
  res.json(await scanStockDocument(req.file));
}

export async function importItems(req: Request, res: Response) {
  const { rows, note } = req.body as { rows: inventory.ImportRow[]; note?: string };
  res.json(await inventory.importRows(rows, note, staffId(req)!));
}
