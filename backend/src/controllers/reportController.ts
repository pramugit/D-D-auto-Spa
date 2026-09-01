import type { Request, Response } from "express";
import * as reportService from "../services/reportService";

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
  const [overTime, byCategory, byTechnician] = await Promise.all([
    reportService.getProfitOverTime(from, to),
    reportService.getProfitByCategory(from, to),
    reportService.getProfitByTechnician(from, to),
  ]);
  res.json({ overTime, byCategory, byTechnician });
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
