import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

export async function acknowledge(req: Request, res: Response) {
  const inspection = await prisma.damageInspection.findUnique({
    where: { id: req.params.id },
    include: { jobCard: { include: { booking: true } } },
  });
  if (!inspection) throw new AppError(404, "Damage inspection not found");

  // A distinct, explicit action: either the owning customer acknowledges
  // it themselves, or front-desk staff records an in-person acknowledgement.
  if (req.user?.type === "customer" && inspection.jobCard.booking.customerId !== req.user.sub) {
    throw new AppError(403, "Not your vehicle's inspection");
  }

  if (inspection.customerAcknowledged) {
    throw new AppError(409, "Inspection is already acknowledged");
  }

  const updated = await prisma.damageInspection.update({
    where: { id: req.params.id },
    data: { customerAcknowledged: true, acknowledgedAt: new Date() },
  });
  res.json(updated);
}
