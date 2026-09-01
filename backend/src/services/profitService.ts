import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ProfitBreakdown {
  jobCardId: string;
  revenue: number;
  materialCost: number;
  laborCost: number;
  profit: number;
}

/**
 * revenue - materialCost - laborCost for one job card.
 *   revenue      = the job card's invoice total (0 if no invoice yet)
 *   materialCost = sum(InventoryUsage.quantityUsed * item.costPerUnit)
 *   laborCost    = (completedAt - startedAt) hours * sum of assigned
 *                  technicians' hourlyRate (missing rate treated as 0;
 *                  not started/completed yet treated as 0, not an error)
 */
export async function calculateJobCardProfit(jobCardId: string): Promise<ProfitBreakdown> {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    include: {
      invoice: true,
      inventoryUsages: { include: { item: true } },
      technicians: { include: { user: true } },
    },
  });
  if (!jobCard) throw new AppError(404, "Job card not found");

  const revenue = jobCard.invoice ? Number(jobCard.invoice.total) : 0;

  const materialCost = jobCard.inventoryUsages.reduce(
    (sum, usage) => sum + Number(usage.quantityUsed) * Number(usage.item.costPerUnit),
    0
  );

  let laborCost = 0;
  if (jobCard.startedAt && jobCard.completedAt) {
    const hoursWorked = (jobCard.completedAt.getTime() - jobCard.startedAt.getTime()) / (1000 * 60 * 60);
    const combinedHourlyRate = jobCard.technicians.reduce(
      (sum, t) => sum + Number(t.user.hourlyRate ?? 0),
      0
    );
    laborCost = hoursWorked * combinedHourlyRate;
  }

  const profit = revenue - materialCost - laborCost;

  return {
    jobCardId,
    revenue: round2(revenue),
    materialCost: round2(materialCost),
    laborCost: round2(laborCost),
    profit: round2(profit),
  };
}
