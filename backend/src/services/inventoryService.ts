import { Prisma, type StockMovementType } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

type Tx = Prisma.TransactionClient;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Applies a signed stock change and records the movement, in one transaction. */
async function move(
  tx: Tx,
  itemId: string,
  quantity: number,
  type: StockMovementType,
  extra: { note?: string; unitCost?: number; jobCardId?: string; userId?: string | null; newCostPerUnit?: number } = {}
) {
  const item = await tx.inventoryItem.update({
    where: { id: itemId },
    data: {
      quantityInStock: { increment: quantity },
      ...(extra.newCostPerUnit !== undefined ? { costPerUnit: extra.newCostPerUnit } : {}),
    },
  });
  await tx.stockMovement.create({
    data: {
      itemId,
      type,
      quantity,
      balanceAfter: item.quantityInStock,
      unitCost: extra.unitCost ?? null,
      note: extra.note ?? null,
      jobCardId: extra.jobCardId ?? null,
      userId: extra.userId ?? null,
    },
  });
  return item;
}

/** Stock bought in. With a unit cost, the item's cost becomes the weighted average. */
export async function receiveStock(itemId: string, quantity: number, unitCost: number | undefined, note: string | undefined, userId: string) {
  if (!(quantity > 0)) throw new AppError(400, "Quantity received must be more than 0");
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError(404, "Inventory item not found");
    let newCost: number | undefined;
    if (unitCost !== undefined && unitCost >= 0) {
      const onHand = Math.max(0, Number(item.quantityInStock));
      newCost = round2((onHand * Number(item.costPerUnit) + quantity * unitCost) / (onHand + quantity));
    }
    return move(tx, itemId, quantity, "RECEIVED", { note: note || "Stock received", unitCost, userId, newCostPerUnit: newCost });
  });
}

/** Physical stock count — sets the level to what was counted and logs the difference. */
export async function countStock(itemId: string, counted: number, note: string | undefined, userId: string) {
  if (!(counted >= 0)) throw new AppError(400, "Counted quantity can't be negative");
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError(404, "Inventory item not found");
    const diff = round2(counted - Number(item.quantityInStock));
    if (diff === 0) return item;
    return move(tx, itemId, diff, "ADJUSTMENT", { note: note || "Stock count", userId });
  });
}

/** A new item's starting quantity is logged as its opening balance. */
export async function createItem(data: Prisma.InventoryItemCreateInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const opening = Number(data.quantityInStock ?? 0);
    const item = await tx.inventoryItem.create({ data: { ...data, quantityInStock: 0 } });
    if (opening !== 0) return move(tx, item.id, opening, "RECEIVED", { note: "Opening balance", userId });
    return item;
  });
}

/** Manual "item used" on a job card — same stock + history path as the automatic one. */
export async function recordJobUsage(jobCardId: string, itemId: string, quantity: number, userId: string | null) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError(404, "Inventory item not found");
    if (Number(item.quantityInStock) < quantity) {
      // Surfaced by the UI as a prompt to switch to the external-purchase path.
      throw new AppError(
        400,
        `Insufficient stock: ${item.name} has ${item.quantityInStock} ${item.unit} remaining. Record this as an external purchase instead.`
      );
    }
    const usage = await tx.inventoryUsage.create({ data: { jobCardId, itemId, quantityUsed: quantity } });
    const updated = await move(tx, itemId, -quantity, "JOB_USAGE", { jobCardId, userId, note: "Used on job (manual)" });
    return { usage, item: updated };
  });
}

/**
 * Undo a usage line recorded by mistake (on Daily Jobs' "Inventory used"
 * step). Stock lines go back into stock with a logged movement, so the
 * Inventory page's level, history and 30-day usage stay right; external
 * purchases are simply dropped. Not allowed once the job is completed.
 */
export async function removeJobUsage(jobCardId: string, usageId: string, userId: string | null) {
  return prisma.$transaction(async (tx) => {
    const usage = await tx.inventoryUsage.findUnique({
      where: { id: usageId },
      include: { jobCard: { select: { status: true } }, item: { select: { name: true } } },
    });
    if (!usage || usage.jobCardId !== jobCardId) throw new AppError(404, "Usage line not found on this job");
    if (usage.jobCard.status === "COMPLETED") throw new AppError(400, "This job is completed — its materials can't be changed");
    await tx.inventoryUsage.delete({ where: { id: usageId } });
    if (usage.itemId) {
      return move(tx, usage.itemId, Number(usage.quantityUsed), "JOB_USAGE", {
        jobCardId,
        userId,
        note: "Returned to stock (removed from job)",
      });
    }
    return null;
  });
}

/** Everything the Inventory page needs, with the reorder maths done here. */
export async function getOverview() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [items, usage30, services] = await Promise.all([
    prisma.inventoryItem.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.stockMovement.groupBy({
      by: ["itemId"],
      where: { type: "JOB_USAGE", createdAt: { gte: since } },
      _sum: { quantity: true },
    }),
    prisma.service.findMany({
      where: { active: true },
      select: { id: true, name: true, _count: { select: { consumables: true } } },
    }),
  ]);
  const used = new Map(usage30.map((u) => [u.itemId, -Number(u._sum.quantity ?? 0)]));

  const rows = items.map((i) => {
    const stock = Number(i.quantityInStock);
    const reorderLevel = Number(i.reorderLevel);
    const cost = Number(i.costPerUnit);
    const used30 = round2(used.get(i.id) ?? 0);
    const perDay = used30 / 30;
    const daysLeft = perDay > 0 ? Math.max(0, Math.floor(stock / perDay)) : null;
    const status = stock < 0 ? "RECOUNT" : stock === 0 ? "OUT" : stock <= reorderLevel ? "LOW" : "OK";
    // Order enough to get back to a month's usage (at least twice the
    // reorder level) — or the fixed reorder quantity if one is set.
    const target = Math.max(reorderLevel * 2, perDay * 30, 1);
    const suggestedOrder =
      status === "OK"
        ? 0
        : i.reorderQuantity !== null
          ? Number(i.reorderQuantity)
          : Math.max(1, Math.ceil(target - Math.max(stock, 0)));
    return {
      ...i,
      used30,
      daysLeft,
      status,
      suggestedOrder,
      stockValue: round2(Math.max(stock, 0) * cost),
    };
  });

  const usedCost30 = round2(rows.reduce((s, r) => s + r.used30 * Number(r.costPerUnit), 0));
  return {
    items: rows,
    totals: {
      items: rows.length,
      stockValue: round2(rows.reduce((s, r) => s + r.stockValue, 0)),
      low: rows.filter((r) => r.status === "LOW").length,
      out: rows.filter((r) => r.status === "OUT" || r.status === "RECOUNT").length,
      usedCost30,
    },
    servicesWithoutRecipe: services.filter((s) => s._count.consumables === 0).map((s) => s.name),
  };
}

export async function listMovements(itemId: string | undefined, limit: number) {
  return prisma.stockMovement.findMany({
    where: itemId ? { itemId } : {},
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
    include: {
      item: { select: { name: true, unit: true } },
      user: { select: { name: true } },
      jobCard: { select: { id: true, booking: { select: { vehicle: { select: { plateNumber: true } } } } } },
    },
  });
}

export async function listRecipes() {
  return prisma.service.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      category: { select: { name: true } },
      consumables: { select: { itemId: true, quantity: true, item: { select: { name: true, unit: true, costPerUnit: true } } } },
    },
  });
}

/** Replaces one service's recipe. */
export async function setRecipe(serviceId: string, lines: { itemId: string; quantity: number }[]) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) throw new AppError(404, "Service not found");
  const clean = lines.filter((l) => l.quantity > 0);
  if (new Set(clean.map((l) => l.itemId)).size !== clean.length) throw new AppError(400, "Each item can appear only once");
  await prisma.$transaction([
    prisma.serviceConsumable.deleteMany({ where: { serviceId } }),
    prisma.serviceConsumable.createMany({ data: clean.map((l) => ({ serviceId, itemId: l.itemId, quantity: l.quantity })) }),
  ]);
}

// ── Starter kit ──────────────────────────────────────────────────────────
// Typical car-care supplies with per-job amounts for the default services.
// Everything is editable afterwards; stock and cost start at 0 and are
// filled in by "Receive stock".
const STARTER_ITEMS: { name: string; unit: string; category: string; reorderLevel: number; reorderQuantity: number }[] = [
  { name: "Car Shampoo", unit: "L", category: "Chemicals", reorderLevel: 5, reorderQuantity: 20 },
  { name: "Car Wax", unit: "L", category: "Chemicals", reorderLevel: 1, reorderQuantity: 4 },
  { name: "Polishing Compound", unit: "L", category: "Chemicals", reorderLevel: 1, reorderQuantity: 4 },
  { name: "Ceramic Coating Kit", unit: "bottle", category: "Chemicals", reorderLevel: 3, reorderQuantity: 10 },
  { name: "Panel Prep Spray", unit: "L", category: "Chemicals", reorderLevel: 2, reorderQuantity: 5 },
  { name: "Interior Cleaner", unit: "L", category: "Chemicals", reorderLevel: 2, reorderQuantity: 10 },
  { name: "Carpet & Upholstery Shampoo", unit: "L", category: "Chemicals", reorderLevel: 2, reorderQuantity: 10 },
  { name: "Leather Cleaner & Conditioner", unit: "L", category: "Chemicals", reorderLevel: 1, reorderQuantity: 4 },
  { name: "Tyre Shine", unit: "L", category: "Chemicals", reorderLevel: 2, reorderQuantity: 5 },
  { name: "Touch-up Paint", unit: "bottle", category: "Paint", reorderLevel: 2, reorderQuantity: 6 },
  { name: "Microfiber Cloth", unit: "pcs", category: "Consumables", reorderLevel: 20, reorderQuantity: 100 },
  { name: "Clay Bar", unit: "pcs", category: "Consumables", reorderLevel: 3, reorderQuantity: 10 },
  { name: "Polishing Pad", unit: "pcs", category: "Consumables", reorderLevel: 4, reorderQuantity: 10 },
  { name: "Applicator Pad", unit: "pcs", category: "Consumables", reorderLevel: 10, reorderQuantity: 50 },
  { name: "Masking Tape", unit: "roll", category: "Consumables", reorderLevel: 3, reorderQuantity: 10 },
];

const STARTER_RECIPES: Record<string, [string, number][]> = {
  "Exterior Wash": [["Car Shampoo", 0.2], ["Tyre Shine", 0.05], ["Microfiber Cloth", 2]],
  "Exterior Wax": [["Car Wax", 0.1], ["Applicator Pad", 1], ["Microfiber Cloth", 2]],
  "Paint Correction": [["Polishing Compound", 0.15], ["Polishing Pad", 1], ["Panel Prep Spray", 0.1], ["Clay Bar", 0.5], ["Masking Tape", 0.5], ["Microfiber Cloth", 3]],
  "Ceramic Coating": [["Ceramic Coating Kit", 1], ["Panel Prep Spray", 0.2], ["Applicator Pad", 2], ["Microfiber Cloth", 4]],
  "Dent & Scratch Removal": [["Touch-up Paint", 0.25], ["Polishing Compound", 0.05], ["Masking Tape", 0.5], ["Microfiber Cloth", 1]],
  "Interior Vacuum & Wipe Down": [["Interior Cleaner", 0.15], ["Microfiber Cloth", 2]],
  "Seat & Carpet Shampoo": [["Carpet & Upholstery Shampoo", 0.3], ["Microfiber Cloth", 2]],
  "Leather Conditioning": [["Leather Cleaner & Conditioner", 0.1], ["Applicator Pad", 1], ["Microfiber Cloth", 1]],
};

/** Adds missing starter items, and recipes for services that have none yet. Safe to run twice. */
export async function installStarterKit() {
  const existing = await prisma.inventoryItem.findMany({ select: { id: true, name: true } });
  const byName = new Map(existing.map((i) => [i.name.toLowerCase(), i.id]));
  let itemsAdded = 0;
  for (const s of STARTER_ITEMS) {
    if (byName.has(s.name.toLowerCase())) continue;
    const item = await prisma.inventoryItem.create({ data: { ...s, quantityInStock: 0, costPerUnit: 0 } });
    byName.set(s.name.toLowerCase(), item.id);
    itemsAdded++;
  }
  const services = await prisma.service.findMany({ select: { id: true, name: true, _count: { select: { consumables: true } } } });
  let recipesAdded = 0;
  for (const svc of services) {
    const recipe = STARTER_RECIPES[svc.name];
    if (!recipe || svc._count.consumables > 0) continue;
    await prisma.serviceConsumable.createMany({
      data: recipe
        .map(([name, quantity]) => ({ serviceId: svc.id, itemId: byName.get(name.toLowerCase())!, quantity }))
        .filter((l) => l.itemId),
    });
    recipesAdded++;
  }
  return { itemsAdded, recipesAdded };
}

// ── Bulk import (CSV / Excel / scanned bill) ─────────────────────────────
export type ImportRow = {
  itemId?: string | null; // existing item → stock is received into it
  name: string;
  unit: string;
  quantity: number;
  unitCost?: number | null;
  category?: string | null;
  reorderLevel?: number | null;
  supplierName?: string | null;
  supplierPhone?: string | null;
};

/**
 * Applies reviewed import rows in one transaction: rows matched to an
 * existing item receive stock into it (weighted-average cost, logged as
 * RECEIVED); unmatched rows become new items with that opening stock.
 */
export async function importRows(rows: ImportRow[], note: string | undefined, userId: string) {
  return prisma.$transaction(async (tx) => {
    let created = 0;
    let received = 0;
    for (const r of rows) {
      const qty = round2(r.quantity);
      const cost = r.unitCost ?? undefined;
      let itemId = r.itemId ?? null;
      if (!itemId) {
        // Same name already exists (e.g. two rows in one file) → reuse it.
        const existing = await tx.inventoryItem.findFirst({ where: { name: { equals: r.name.trim(), mode: "insensitive" } } });
        itemId = existing?.id ?? null;
      }
      if (itemId) {
        const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
        if (!item) throw new AppError(404, `Item for "${r.name}" no longer exists`);
        if (r.supplierName && !item.supplierName) {
          await tx.inventoryItem.update({
            where: { id: itemId },
            data: { supplierName: r.supplierName, supplierPhone: item.supplierPhone ?? r.supplierPhone ?? null },
          });
        }
        if (qty > 0) {
          let newCost: number | undefined;
          if (cost !== undefined && cost >= 0) {
            const onHand = Math.max(0, Number(item.quantityInStock));
            newCost = round2((onHand * Number(item.costPerUnit) + qty * cost) / (onHand + qty));
          }
          await move(tx, itemId, qty, "RECEIVED", { note: note || "Imported", unitCost: cost, userId, newCostPerUnit: newCost });
          received++;
        }
      } else {
        const item = await tx.inventoryItem.create({
          data: {
            name: r.name.trim(),
            unit: r.unit.trim() || "pcs",
            quantityInStock: 0,
            reorderLevel: r.reorderLevel ?? 0,
            costPerUnit: cost ?? 0,
            category: r.category || null,
            supplierName: r.supplierName || null,
            supplierPhone: r.supplierPhone || null,
          },
        });
        if (qty > 0) await move(tx, item.id, qty, "RECEIVED", { note: note || "Imported (opening stock)", unitCost: cost, userId });
        created++;
      }
    }
    return { created, received };
  });
}
