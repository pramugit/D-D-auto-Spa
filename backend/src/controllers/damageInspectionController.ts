import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import * as inspectionService from "../services/damageInspectionService";

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
    data: {
      customerAcknowledged: true,
      acknowledgedAt: new Date(),
      acknowledgedVia: req.user?.type === "customer" ? "CUSTOMER_PORTAL" : "STAFF_IN_PERSON",
    },
  });
  res.json(updated);
}

export async function getLink(req: Request, res: Response) {
  res.json(await inspectionService.getOrCreateLink(req.params.id));
}

export async function sendToCustomer(req: Request, res: Response) {
  res.json(await inspectionService.sendToCustomer(req.params.id));
}

export async function confirmInPerson(req: Request, res: Response) {
  await inspectionService.confirmInPerson(req.params.id, req.body.decisions, req.body.comment);
  res.json({ ok: true });
}

// ---- Public (no login) — the customer's approval link ----

export async function getPublic(req: Request, res: Response) {
  res.json(await inspectionService.getPublic(req.params.token));
}

export async function respondPublic(req: Request, res: Response) {
  res.json(await inspectionService.respondPublic(req.params.token, req.body.decisions, req.body.comment));
}
