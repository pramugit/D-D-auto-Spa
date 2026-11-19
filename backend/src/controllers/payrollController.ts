import type { Request, Response } from "express";
import * as payrollService from "../services/payrollService";
import * as epf from "../services/epfService";

export async function generate(req: Request, res: Response) {
  const records = await payrollService.generateForMonth(req.body.month);
  res.status(201).json(records);
}

export async function list(req: Request, res: Response) {
  const month = req.query.month as string | undefined;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "month query param (YYYY-MM) is required" });
    return;
  }
  const records = await payrollService.listForMonth(month);
  res.json(records);
}

export async function adjust(req: Request, res: Response) {
  res.json(await payrollService.adjust(req.params.id, req.body));
}

export async function markPaid(req: Request, res: Response) {
  const record = await payrollService.markPaid(req.params.id);
  res.json(record);
}

export async function epfReport(req: Request, res: Response) {
  res.json(await epf.epfReport(String(req.query.month ?? "")));
}

export async function getSettings(_req: Request, res: Response) {
  res.json(await epf.getPayrollSettings());
}

export async function saveSettings(req: Request, res: Response) {
  res.json(await epf.savePayrollSettings(req.body));
}
