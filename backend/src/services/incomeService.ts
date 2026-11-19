import { prisma } from "../utils/prisma";

/**
 * Raw rows behind the Invoices page's income dashboard. Bucketing (by
 * hour/day/week/month) happens client-side so it follows the shop's local
 * calendar rather than the server's timezone; this just returns everything
 * in the window, split by where the job came from:
 *   - walk-in  = Daily Jobs (booking.isWalkIn)
 *   - booking  = scheduled appointments
 *
 * "Income" is the invoice total of jobs COMPLETED inside [from, to)
 * (dated by jobCard.completedAt). "Collected" is verified payments
 * received inside the window (dated by payment.createdAt), whatever the
 * job's status — the cash actually taken in.
 */
export async function getIncomeData(from: Date, to: Date) {
  const [jobCards, payments, openInvoices, pending] = await Promise.all([
    prisma.jobCard.findMany({
      where: { status: "COMPLETED", completedAt: { gte: from, lt: to } },
      select: {
        id: true,
        completedAt: true,
        invoice: { select: { total: true, subtotal: true, tax: true, discount: true, status: true } },
        booking: {
          select: {
            isWalkIn: true,
            services: {
              select: { price: true, service: { select: { name: true } }, package: { select: { name: true } } },
            },
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: { status: "VERIFIED", createdAt: { gte: from, lt: to } },
      select: {
        createdAt: true,
        method: true,
        amount: true,
        invoice: { select: { jobCard: { select: { booking: { select: { isWalkIn: true } } } } } },
      },
    }),
    // Outstanding is "right now", not windowed — every invoice not yet paid.
    prisma.invoice.findMany({
      where: { status: { not: "PAID" } },
      select: {
        total: true,
        payments: { where: { status: "VERIFIED" }, select: { amount: true } },
        jobCard: { select: { booking: { select: { isWalkIn: true } } } },
      },
    }),
    prisma.payment.findMany({
      where: { status: "PENDING_VERIFICATION" },
      select: { amount: true },
    }),
  ]);

  const outstanding = { walkIn: 0, booking: 0, invoices: 0 };
  for (const inv of openInvoices) {
    const due = Number(inv.total) - inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    if (due <= 0) continue;
    outstanding.invoices += 1;
    if (inv.jobCard.booking.isWalkIn) outstanding.walkIn += due;
    else outstanding.booking += due;
  }

  return {
    from,
    to,
    jobs: jobCards.map((j) => ({
      id: j.id,
      completedAt: j.completedAt,
      isWalkIn: j.booking.isWalkIn,
      total: Number(j.invoice?.total ?? 0),
      tax: Number(j.invoice?.tax ?? 0),
      discount: Number(j.invoice?.discount ?? 0),
      paid: j.invoice?.status === "PAID",
      items: j.booking.services.map((s) => ({
        name: s.package?.name ?? s.service?.name ?? "Other",
        isPackage: !!s.package,
        price: Number(s.price),
      })),
    })),
    payments: payments.map((p) => ({
      createdAt: p.createdAt,
      method: p.method,
      amount: Number(p.amount),
      isWalkIn: p.invoice.jobCard.booking.isWalkIn,
    })),
    outstanding: {
      walkIn: Math.round(outstanding.walkIn * 100) / 100,
      booking: Math.round(outstanding.booking * 100) / 100,
      invoices: outstanding.invoices,
    },
    pendingVerification: {
      count: pending.length,
      amount: Math.round(pending.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100,
    },
  };
}
