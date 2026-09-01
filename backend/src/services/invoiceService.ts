import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { transitionBookingStatus, BOOKING_STATUS_TRANSITIONS } from "./bookingService";

const DEFAULT_TAX_RATE = 0.08; // 8% flat rate for this pass; make configurable later.

export async function createInvoiceForJobCard(jobCardId: string, taxRate?: number, discount?: number) {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    include: { booking: { include: { services: true } }, invoice: true },
  });
  if (!jobCard) throw new AppError(404, "Job card not found");
  if (jobCard.invoice) throw new AppError(409, "Invoice already exists for this job card");

  const subtotal = jobCard.booking.services.reduce((sum, s) => sum + Number(s.price), 0);
  const rate = taxRate ?? DEFAULT_TAX_RATE;
  const tax = Math.round(subtotal * rate * 100) / 100;
  const disc = discount ?? 0;
  const total = Math.round((subtotal + tax - disc) * 100) / 100;

  const invoice = await prisma.invoice.create({
    data: {
      jobCardId,
      subtotal,
      tax,
      discount: disc,
      total,
      status: "UNPAID",
    },
  });
  return invoice;
}

/** Sum of VERIFIED payments against an invoice. */
async function verifiedTotal(invoiceId: string): Promise<number> {
  const payments = await prisma.payment.findMany({ where: { invoiceId, status: "VERIFIED" } });
  return payments.reduce((sum, p) => sum + Number(p.amount), 0);
}

/**
 * Recomputes an invoice's status from its verified payments, and marks
 * the booking COMPLETED once fully paid (only if that's currently a
 * valid transition — i.e. the booking is at READY).
 */
// 1 loyalty point per whole currency unit spent.
const LOYALTY_POINTS_PER_CURRENCY_UNIT = 1;

export async function reconcileInvoiceStatus(invoiceId: string, verifiedByUserId: string | null = null) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { jobCard: { include: { booking: true } } },
  });
  if (!invoice) throw new AppError(404, "Invoice not found");

  const wasAlreadyPaid = invoice.status === "PAID";

  const paid = await verifiedTotal(invoiceId);
  let status: "UNPAID" | "PARTIALLY_PAID" | "PAID" = "UNPAID";
  if (paid >= Number(invoice.total) && Number(invoice.total) > 0) status = "PAID";
  else if (paid > 0) status = "PARTIALLY_PAID";

  const updated = await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });

  if (status === "PAID" && !wasAlreadyPaid) {
    const points = Math.floor(Number(invoice.total) * LOYALTY_POINTS_PER_CURRENCY_UNIT);
    await prisma.customer.update({
      where: { id: invoice.jobCard.booking.customerId },
      data: { loyaltyPoints: { increment: points } },
    });

    const bookingStatus = invoice.jobCard.booking.status;
    if (BOOKING_STATUS_TRANSITIONS[bookingStatus]?.includes("COMPLETED")) {
      await transitionBookingStatus(invoice.jobCard.booking.id, "COMPLETED", {
        userId: verifiedByUserId,
        notes: "Auto-completed: invoice paid in full",
      });
    }
  }

  return updated;
}
