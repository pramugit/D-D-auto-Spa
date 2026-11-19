import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { transitionBookingStatus, BOOKING_STATUS_TRANSITIONS } from "./bookingService";

const DEFAULT_TAX_RATE = 0.08; // 8% flat rate for this pass; make configurable later.

const jobCardForInvoiceInclude = {
  booking: { include: { services: true } },
  invoice: true,
  damageInspections: { include: { markings: true } },
  inventoryUsages: true,
} as const;

type JobCardForInvoice = NonNullable<Awaited<ReturnType<typeof loadJobCardForInvoice>>>;

async function loadJobCardForInvoice(jobCardId: string) {
  return prisma.jobCard.findUnique({ where: { id: jobCardId }, include: jobCardForInvoiceInclude });
}

/**
 * The three billable buckets that make up an invoice's subtotal — shared
 * by both createInvoiceForJobCard (first draft) and
 * recalculateInvoiceForJobCard (keeping an existing invoice in sync).
 * Declined/pending markings and INTERNAL_STOCK usage are deliberately
 * excluded: only what the customer actually agreed to pay for.
 */
function computeSubtotal(jobCard: JobCardForInvoice) {
  const servicesTotal = jobCard.booking.services.reduce((sum, s) => sum + Number(s.price), 0);

  const approvedRepairsTotal = jobCard.damageInspections.reduce(
    (sum, inspection) =>
      sum +
      inspection.markings
        .filter((m) => m.isAdditionalRepairOffer && m.approvalStatus === "APPROVED")
        .reduce((s, m) => s + Number(m.suggestedPrice ?? 0), 0),
    0
  );

  const externalPartsTotal = jobCard.inventoryUsages
    .filter((u) => u.sourceType === "EXTERNAL_PURCHASE")
    .reduce((sum, u) => sum + Number(u.quantityUsed) * Number(u.externalCost ?? 0), 0);

  return { servicesTotal, approvedRepairsTotal, externalPartsTotal, subtotal: servicesTotal + approvedRepairsTotal + externalPartsTotal };
}

export async function createInvoiceForJobCard(jobCardId: string, taxRate?: number, discount?: number) {
  const jobCard = await loadJobCardForInvoice(jobCardId);
  if (!jobCard) throw new AppError(404, "Job card not found");
  if (jobCard.invoice) throw new AppError(409, "Invoice already exists for this job card");

  const { subtotal } = computeSubtotal(jobCard);
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

/**
 * Keeps an already-generated invoice's totals in sync after a customer
 * approves/declines an additional-repair offer, or staff records an
 * external purchase — both can happen after the invoice was auto-drafted
 * at QUALITY_CHECK. Idempotent: it recomputes subtotal/tax/total from
 * current approved markings + external usages each time rather than
 * appending anything, so calling it repeatedly never duplicates a line
 * item — there simply are no stored line-item rows to duplicate, only an
 * aggregate that's always re-derived fresh.
 *
 * The original tax rate isn't stored on Invoice (only the resulting
 * dollar amount), so it's re-derived from the existing tax/subtotal ratio
 * to preserve whatever rate staff used at creation instead of silently
 * reapplying the default. Discount (a flat dollar amount, not a rate)
 * carries over unchanged. No-ops if no invoice exists yet — that's
 * createInvoiceForJobCard's job, triggered separately (e.g. at
 * QUALITY_CHECK).
 */
export async function recalculateInvoiceForJobCard(jobCardId: string) {
  const jobCard = await loadJobCardForInvoice(jobCardId);
  if (!jobCard || !jobCard.invoice) return null;

  const { subtotal } = computeSubtotal(jobCard);
  const priorSubtotal = Number(jobCard.invoice.subtotal);
  const priorTax = Number(jobCard.invoice.tax);
  const impliedRate = priorSubtotal > 0 ? priorTax / priorSubtotal : DEFAULT_TAX_RATE;

  const tax = Math.round(subtotal * impliedRate * 100) / 100;
  const discount = Number(jobCard.invoice.discount);
  const total = Math.round((subtotal + tax - discount) * 100) / 100;

  const updated = await prisma.invoice.update({
    where: { id: jobCard.invoice.id },
    data: { subtotal, tax, total },
  });

  // The invoice total just moved — re-check whether it's still fully
  // covered by what's already been paid (e.g. a partial payment might
  // now read as insufficient if a new approved repair raised the total).
  await reconcileInvoiceStatus(updated.id);

  return updated;
}

/** Sum of VERIFIED payments against an invoice. */
async function verifiedTotal(invoiceId: string): Promise<number> {
  const payments = await prisma.payment.findMany({ where: { invoiceId, status: "VERIFIED" } });
  return payments.reduce((sum, p) => sum + Number(p.amount), 0);
}

/**
 * Recomputes an invoice's status from its verified payments, and marks
 * a scheduled booking COMPLETED once fully paid (only if that's currently
 * a valid transition — i.e. the booking is at READY). Walk-ins are left
 * at READY for staff to complete by hand.
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

    // Walk-ins (Daily Jobs) are NOT auto-completed — staff press
    // "Completed" themselves once the customer has paid and the vehicle
    // is handed over (see transitionBookingStatus).
    const bookingStatus = invoice.jobCard.booking.status;
    if (!invoice.jobCard.booking.isWalkIn && BOOKING_STATUS_TRANSITIONS[bookingStatus]?.includes("COMPLETED")) {
      await transitionBookingStatus(invoice.jobCard.booking.id, "COMPLETED", {
        userId: verifiedByUserId,
        notes: "Auto-completed: invoice paid in full",
      });
    }
  }

  return updated;
}

/** Best-effort sync used by callers that don't already exist an invoice
 *  and shouldn't fail their own request if there isn't one yet (e.g. a
 *  damage-marking decision on a job card still in IN_PROGRESS). */
export async function recalculateInvoiceIfExists(jobCardId: string) {
  try {
    await recalculateInvoiceForJobCard(jobCardId);
  } catch (err) {
    console.error("[invoice] recalculation failed:", err);
  }
}
