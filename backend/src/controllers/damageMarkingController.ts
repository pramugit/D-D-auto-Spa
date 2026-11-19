import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { safeCustomerSelect } from "../utils/prismaSelects";
import { recordDamageMarkingDecisionJobNotification } from "../services/jobNotificationService";
import { recalculateInvoiceIfExists } from "../services/invoiceService";

const markingInclude = {
  damageType: true,
  damageInspection: {
    include: {
      jobCard: {
        include: {
          booking: { include: { customer: { select: safeCustomerSelect }, vehicle: true } },
        },
      },
    },
  },
} as const;

/** The customer's binary decision on one additional-repair offer —
 *  customer-auth only, and only on a marking tied to their own booking.
 *  Locks the moment they decide: re-deciding requires a staff reset (see
 *  reset below), never another customer PATCH. */
export async function decide(req: Request, res: Response) {
  const marking = await prisma.damageMarking.findUnique({ where: { id: req.params.id }, include: markingInclude });
  if (!marking) throw new AppError(404, "Damage marking not found");

  const booking = marking.damageInspection.jobCard.booking;
  if (req.user?.type !== "customer" || booking.customerId !== req.user.sub) {
    throw new AppError(403, "Not your vehicle's damage marking");
  }
  if (!marking.isAdditionalRepairOffer) {
    throw new AppError(400, "This marking is documentation only and doesn't require a decision");
  }
  if (marking.approvalStatus !== "PENDING") {
    throw new AppError(
      409,
      `This offer was already ${marking.approvalStatus.toLowerCase()} — ask staff to reset it if a correction is needed`
    );
  }

  const approved = req.body.approved as boolean;
  const updated = await prisma.damageMarking.update({
    where: { id: req.params.id },
    data: { approvalStatus: approved ? "APPROVED" : "DECLINED", decidedAt: new Date() },
  });

  const label = marking.damageType?.name ?? marking.note ?? "damage repair";
  await recordDamageMarkingDecisionJobNotification(marking.damageInspection.jobCard, approved, label);
  await recalculateInvoiceIfExists(marking.damageInspection.jobCardId);

  res.json(updated);
}

/** Staff-only correction path — resets a decided offer back to PENDING
 *  so the customer can be asked again. The customer themselves can never
 *  do this (see decide's 409 above). */
export async function reset(req: Request, res: Response) {
  const marking = await prisma.damageMarking.findUnique({
    where: { id: req.params.id },
    include: { damageInspection: { select: { jobCardId: true } } },
  });
  if (!marking) throw new AppError(404, "Damage marking not found");
  if (!marking.isAdditionalRepairOffer) {
    throw new AppError(400, "This marking is documentation only and has no decision to reset");
  }

  const updated = await prisma.damageMarking.update({
    where: { id: req.params.id },
    data: { approvalStatus: "PENDING", decidedAt: null },
  });

  await recalculateInvoiceIfExists(marking.damageInspection.jobCardId);

  res.json(updated);
}
