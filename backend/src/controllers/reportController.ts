import type { Request, Response } from "express";
import * as reportService from "../services/reportService";
import { getIncomeData } from "../services/incomeService";
import * as summary from "../services/reportSummaryService";
import { AppError } from "../utils/AppError";

function parseDateRange(req: Request) {
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
  return { from, to };
}

export async function revenue(req: Request, res: Response) {
  const granularity = (req.query.granularity as reportService.RevenueGranularity) ?? "daily";
  const { from, to } = parseDateRange(req);
  const data = await reportService.getRevenueOverTime(granularity, from, to);
  res.json(data);
}

export async function topServices(req: Request, res: Response) {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const data = await reportService.getMostBookedServices(limit);
  res.json(data);
}

export async function technicians(_req: Request, res: Response) {
  const data = await reportService.getTechnicianStats();
  res.json(data);
}

export async function bayUtilization(req: Request, res: Response) {
  const { from, to } = parseDateRange(req);
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const data = await reportService.getBayUtilization(from ?? defaultFrom, to ?? now);
  res.json(data);
}

export async function repeatCustomers(_req: Request, res: Response) {
  const data = await reportService.getRepeatCustomerRate();
  res.json(data);
}

export async function profit(req: Request, res: Response) {
  const { from, to } = parseDateRange(req);
  const [overTime, daily, booking, byCategory, byTechnician] = await Promise.all([
    reportService.getProfitOverTime(from, to),
    reportService.getProfitOverTime(from, to, true),
    reportService.getProfitOverTime(from, to, false),
    reportService.getProfitByCategory(from, to),
    reportService.getProfitByTechnician(from, to),
  ]);
  // `split` separates Daily Jobs (walk-ins) from scheduled bookings.
  res.json({ overTime, split: { daily, booking }, byCategory, byTechnician });
}

export async function satisfaction(req: Request, res: Response) {
  const { from, to } = parseDateRange(req);
  const [overall, byTechnician, byCategory] = await Promise.all([
    reportService.getAverageRating(from, to),
    reportService.getAverageRatingByTechnician(from, to),
    reportService.getAverageRatingByCategory(from, to),
  ]);
  res.json({ overall, byTechnician, byCategory });
}

export async function satisfactionAlerts(_req: Request, res: Response) {
  const data = await reportService.getSatisfactionAlerts();
  res.json(data);
}

/** Income dashboard on the Invoices page — see incomeService. */
export async function income(req: Request, res: Response) {
  const { from, to } = parseDateRange(req);
  if (!from || !to || isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
    throw new AppError(400, "from and to must be valid ISO dates with from < to");
  }
  // At most ~2 years per request keeps the raw-row payload sane.
  if (to.getTime() - from.getTime() > 1000 * 60 * 60 * 24 * 800) {
    throw new AppError(400, "Date range too long (max ~2 years)");
  }
  res.json(await getIncomeData(from, to));
}

/** Reports page: one period's numbers + comparison + automatic insights. */
export async function reportSummary(req: Request, res: Response) {
  const { from, to } = parseDateRange(req);
  if (!from || !to || isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
    throw new AppError(400, "from and to must be valid ISO dates with from < to");
  }
  if (to.getTime() - from.getTime() > 1000 * 60 * 60 * 24 * 400) throw new AppError(400, "Date range too long (max ~13 months)");
  res.json(await summary.getReportSummary(from, to));
}

export async function dailySettings(_req: Request, res: Response) {
  res.json(await summary.getDailySettings());
}

export async function saveDailySettings(req: Request, res: Response) {
  const { enabled, whatsappNumber, hour } = req.body as { enabled: boolean; whatsappNumber: string; hour: number };
  res.json(await summary.saveDailySettings({ enabled, whatsappNumber, hour }));
}

export async function dailyPreview(_req: Request, res: Response) {
  res.json({ text: await summary.buildDailyReportText() });
}

export async function dailySendNow(_req: Request, res: Response) {
  res.json(await summary.sendDailyReport());
}
