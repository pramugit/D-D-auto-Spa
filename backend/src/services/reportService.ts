import { prisma } from "../utils/prisma";
import { BUSINESS_END_HOUR, BUSINESS_START_HOUR, bookingDurationMinutes } from "./bookingService";
import { calculateJobCardProfit, round2 } from "./profitService";
import type { ServiceCategoryName } from "@prisma/client";

export type RevenueGranularity = "daily" | "weekly" | "monthly";

function bucketKey(date: Date, granularity: RevenueGranularity): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (granularity === "monthly") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (granularity === "weekly") {
    // ISO week start (Monday) of the bucket, as a date key.
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - day + 1);
    return d.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

/** Revenue over time, bucketed by verified payment date. */
export async function getRevenueOverTime(granularity: RevenueGranularity, from?: Date, to?: Date) {
  const payments = await prisma.payment.findMany({
    where: {
      status: "VERIFIED",
      createdAt: {
        gte: from,
        lte: to,
      },
    },
    select: { amount: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const buckets = new Map<string, number>();
  for (const p of payments) {
    const key = bucketKey(p.createdAt, granularity);
    buckets.set(key, (buckets.get(key) ?? 0) + Number(p.amount));
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([period, revenue]) => ({ period, revenue: Math.round(revenue * 100) / 100 }));
}

/** Most booked services (by line-item count), excluding cancelled bookings. */
export async function getMostBookedServices(limit = 10) {
  const items = await prisma.bookingService.findMany({
    where: { booking: { status: { not: "CANCELLED" } } },
    select: {
      serviceId: true,
      packageId: true,
      price: true,
      service: { select: { name: true } },
      package: { select: { name: true } },
    },
  });

  const counts = new Map<string, { name: string; count: number; revenue: number }>();
  for (const item of items) {
    const key = item.serviceId ?? item.packageId ?? "unknown";
    const name = item.service?.name ?? item.package?.name ?? "Unknown";
    const existing = counts.get(key) ?? { name, count: 0, revenue: 0 };
    existing.count += 1;
    existing.revenue += Number(item.price);
    counts.set(key, existing);
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Per-technician job counts and average completion time (minutes). */
export async function getTechnicianStats() {
  const technicians = await prisma.user.findMany({
    where: { role: "TECHNICIAN" },
    select: {
      id: true,
      name: true,
      jobCards: {
        select: {
          jobCard: { select: { status: true, startedAt: true, completedAt: true } },
        },
      },
    },
  });

  return technicians.map((t) => {
    const jobCards = t.jobCards.map((jc) => jc.jobCard);
    const completed = jobCards.filter((jc) => jc.status === "COMPLETED" && jc.startedAt && jc.completedAt);
    const avgMinutes =
      completed.length > 0
        ? completed.reduce((sum, jc) => sum + (jc.completedAt!.getTime() - jc.startedAt!.getTime()) / 60000, 0) /
          completed.length
        : null;

    return {
      technicianId: t.id,
      name: t.name,
      jobCount: jobCards.length,
      completedCount: completed.length,
      avgCompletionMinutes: avgMinutes !== null ? Math.round(avgMinutes) : null,
    };
  });
}

/** Bay utilization: booked hours vs. available business hours, over a date range. */
export async function getBayUtilization(from: Date, to: Date) {
  const bays = await prisma.bay.findMany({ where: { status: { not: "MAINTENANCE" } } });

  const businessDays = Math.max(
    1,
    Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
  );
  const availableMinutesPerBay = businessDays * (BUSINESS_END_HOUR - BUSINESS_START_HOUR) * 60;

  const results = [];
  for (const bay of bays) {
    const bookings = await prisma.booking.findMany({
      where: {
        bayId: bay.id,
        status: { notIn: ["CANCELLED", "PENDING"] },
        scheduledAt: { gte: from, lte: to },
      },
      select: { id: true },
    });

    let bookedMinutes = 0;
    for (const b of bookings) {
      bookedMinutes += await bookingDurationMinutes(b.id);
    }

    results.push({
      bayId: bay.id,
      name: bay.name,
      bookedMinutes,
      availableMinutes: availableMinutesPerBay,
      utilizationRate: availableMinutesPerBay > 0 ? Math.round((bookedMinutes / availableMinutesPerBay) * 1000) / 10 : 0,
    });
  }

  return results;
}

/** Job card ids whose invoice was generated within [from, to]. */
async function getJobCardIdsInvoicedInRange(from?: Date, to?: Date): Promise<string[]> {
  const invoices = await prisma.invoice.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { jobCardId: true },
  });
  return invoices.map((i) => i.jobCardId);
}

/** Total profit across every invoiced job card in a date range. */
export async function getProfitOverTime(from?: Date, to?: Date) {
  const jobCardIds = await getJobCardIdsInvoicedInRange(from, to);
  let totalRevenue = 0;
  let totalMaterialCost = 0;
  let totalLaborCost = 0;
  let totalProfit = 0;

  for (const jobCardId of jobCardIds) {
    const breakdown = await calculateJobCardProfit(jobCardId);
    totalRevenue += breakdown.revenue;
    totalMaterialCost += breakdown.materialCost;
    totalLaborCost += breakdown.laborCost;
    totalProfit += breakdown.profit;
  }

  return {
    jobCardCount: jobCardIds.length,
    revenue: round2(totalRevenue),
    materialCost: round2(totalMaterialCost),
    laborCost: round2(totalLaborCost),
    profit: round2(totalProfit),
  };
}

/**
 * How much of a booking's line-item revenue falls in each category. A
 * package's price is split evenly across the categories of its
 * constituent services (e.g. a package with 2 exterior + 1 interior
 * service allocates 2/3 of its price to EXTERIOR). Used to apportion a
 * job card's profit across categories proportionally to revenue share,
 * since costs aren't tracked per category in this data model.
 */
async function getCategoryRevenueShares(bookingId: string): Promise<Record<ServiceCategoryName, number>> {
  const items = await prisma.bookingService.findMany({
    where: { bookingId },
    include: {
      service: { include: { category: true } },
      package: { include: { services: { include: { service: { include: { category: true } } } } } },
    },
  });

  const shares: Record<ServiceCategoryName, number> = { EXTERIOR: 0, INTERIOR: 0 };
  for (const item of items) {
    const price = Number(item.price);
    if (item.service) {
      shares[item.service.category.name] += price;
    } else if (item.package && item.package.services.length > 0) {
      const perService = price / item.package.services.length;
      for (const link of item.package.services) {
        shares[link.service.category.name] += perService;
      }
    }
  }
  return shares;
}

/** Profit apportioned by service category (EXTERIOR vs INTERIOR), over a date range. */
export async function getProfitByCategory(from?: Date, to?: Date) {
  const jobCardIds = await getJobCardIdsInvoicedInRange(from, to);
  const jobCards = await prisma.jobCard.findMany({
    where: { id: { in: jobCardIds } },
    select: { id: true, bookingId: true },
  });

  const totals: Record<ServiceCategoryName, number> = { EXTERIOR: 0, INTERIOR: 0 };
  for (const jc of jobCards) {
    const breakdown = await calculateJobCardProfit(jc.id);
    const shares = await getCategoryRevenueShares(jc.bookingId);
    const totalShare = shares.EXTERIOR + shares.INTERIOR;
    if (totalShare === 0) continue;
    totals.EXTERIOR += breakdown.profit * (shares.EXTERIOR / totalShare);
    totals.INTERIOR += breakdown.profit * (shares.INTERIOR / totalShare);
  }

  return { EXTERIOR: round2(totals.EXTERIOR), INTERIOR: round2(totals.INTERIOR) };
}

/** Profit split evenly among a job card's assigned technicians, summed per technician, over a date range. */
export async function getProfitByTechnician(from?: Date, to?: Date) {
  const jobCardIds = await getJobCardIdsInvoicedInRange(from, to);
  const jobCards = await prisma.jobCard.findMany({
    where: { id: { in: jobCardIds } },
    select: { id: true, technicians: { select: { userId: true, user: { select: { name: true } } } } },
  });

  const totals = new Map<string, { name: string; profit: number }>();
  for (const jc of jobCards) {
    if (jc.technicians.length === 0) continue;
    const breakdown = await calculateJobCardProfit(jc.id);
    const share = breakdown.profit / jc.technicians.length;
    for (const t of jc.technicians) {
      const existing = totals.get(t.userId) ?? { name: t.user.name, profit: 0 };
      existing.profit += share;
      totals.set(t.userId, existing);
    }
  }

  return Array.from(totals.entries())
    .map(([technicianId, v]) => ({ technicianId, name: v.name, profit: round2(v.profit) }))
    .sort((a, b) => b.profit - a.profit);
}

/** Fraction of customers with more than one booking. */
export async function getRepeatCustomerRate() {
  const grouped = await prisma.booking.groupBy({
    by: ["customerId"],
    _count: { id: true },
  });

  const totalCustomers = grouped.length;
  const repeatCustomers = grouped.filter((g) => g._count.id > 1).length;

  return {
    totalCustomers,
    repeatCustomers,
    repeatRate: totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 1000) / 10 : 0,
  };
}
