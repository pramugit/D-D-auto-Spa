import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { createInvoiceForJobCard, reconcileInvoiceStatus } from "../services/invoiceService";
import { safeCustomerSelect } from "../utils/prismaSelects";

const invoiceInclude = {
  payments: true,
  jobCard: { include: { booking: { include: { customer: { select: safeCustomerSelect }, vehicle: true } } } },
} as const;

export async function createForJobCard(req: Request, res: Response) {
  const invoice = await createInvoiceForJobCard(req.params.id, req.body.taxRate, req.body.discount);
  res.status(201).json(invoice);
}

export async function get(req: Request, res: Response) {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: invoiceInclude });
  if (!invoice) throw new AppError(404, "Invoice not found");
  if (req.user?.type === "customer" && invoice.jobCard.booking.customerId !== req.user.sub) {
    throw new AppError(403, "Not your invoice");
  }
  res.json(invoice);
}

export async function list(req: Request, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where: Record<string, unknown> = status ? { status } : {};
  if (req.user?.type === "customer") {
    where.jobCard = { booking: { customerId: req.user.sub } };
  }
  const invoices = await prisma.invoice.findMany({ where, include: invoiceInclude, orderBy: { createdAt: "desc" } });
  res.json(invoices);
}

export async function createPayment(req: Request, res: Response) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { jobCard: { include: { booking: true } } },
  });
  if (!invoice) throw new AppError(404, "Invoice not found");
  if (req.user?.type === "customer" && invoice.jobCard.booking.customerId !== req.user.sub) {
    throw new AppError(403, "Not your invoice");
  }

  const { method, amount } = req.body as { method: "CASH" | "CARD" | "BANK_TRANSFER"; amount: number };

  if (method === "BANK_TRANSFER" && !req.file) {
    throw new AppError(400, "A payment slip file is required for bank transfer payments");
  }
  if (method !== "BANK_TRANSFER" && req.user?.type === "customer") {
    throw new AppError(403, "Customers may only submit bank transfer payments; cash/card is recorded by staff in person");
  }

  const payment = await prisma.payment.create({
    data: {
      invoiceId: req.params.id,
      method,
      amount,
      slipUrl: req.file ? `/uploads/slips/${req.file.filename}` : null,
      status: method === "BANK_TRANSFER" ? "PENDING_VERIFICATION" : "VERIFIED",
      verifiedByUserId: method === "BANK_TRANSFER" ? null : req.user!.type === "staff" ? req.user!.sub : null,
    },
  });

  if (payment.status === "VERIFIED") {
    await reconcileInvoiceStatus(req.params.id, req.user!.type === "staff" ? req.user!.sub : null);
  }

  res.status(201).json(payment);
}

export async function verifyPayment(req: Request, res: Response) {
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
  if (!payment) throw new AppError(404, "Payment not found");
  if (payment.status !== "PENDING_VERIFICATION") {
    throw new AppError(409, `Payment is already ${payment.status}`);
  }

  const status = req.body.status as "VERIFIED" | "REJECTED";
  const updated = await prisma.payment.update({
    where: { id: req.params.id },
    data: { status, verifiedByUserId: req.user!.sub },
  });

  if (status === "VERIFIED") {
    await reconcileInvoiceStatus(payment.invoiceId, req.user!.sub);
  }

  res.json(updated);
}
