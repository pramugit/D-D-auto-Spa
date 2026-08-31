import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

const jobCardInclude = {
  booking: { include: { customer: true, vehicle: true, services: { include: { service: true, package: true } } } },
  technicians: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
  damageInspections: true,
  photos: true,
  invoice: true,
} as const;

export async function list(req: Request, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const jobCards = await prisma.jobCard.findMany({
    where: status ? { status: status as never } : undefined,
    include: jobCardInclude,
  });
  res.json(jobCards);
}

export async function get(req: Request, res: Response) {
  const jobCard = await prisma.jobCard.findUnique({ where: { id: req.params.id }, include: jobCardInclude });
  if (!jobCard) throw new AppError(404, "Job card not found");
  res.json(jobCard);
}

export async function assignTechnicians(req: Request, res: Response) {
  const { technicianIds } = req.body as { technicianIds: string[] };

  const technicians = await prisma.user.findMany({
    where: { id: { in: technicianIds }, role: "TECHNICIAN" },
  });
  if (technicians.length !== technicianIds.length) {
    throw new AppError(400, "One or more technicianIds are invalid or not TECHNICIAN role");
  }

  await prisma.$transaction([
    prisma.jobCardTechnician.deleteMany({ where: { jobCardId: req.params.id } }),
    prisma.jobCardTechnician.createMany({
      data: technicianIds.map((userId) => ({ jobCardId: req.params.id, userId })),
    }),
  ]);

  const jobCard = await prisma.jobCard.findUnique({ where: { id: req.params.id }, include: jobCardInclude });
  res.json(jobCard);
}

export async function updateNotes(req: Request, res: Response) {
  const jobCard = await prisma.jobCard.update({
    where: { id: req.params.id },
    data: { notes: req.body.notes },
  });
  res.json(jobCard);
}

export async function createDamageInspection(req: Request, res: Response) {
  const inspection = await prisma.damageInspection.create({
    data: {
      jobCardId: req.params.id,
      stage: req.body.stage,
      diagramMarkings: req.body.diagramMarkings,
      inspectedByUserId: req.user!.sub,
    },
  });
  res.status(201).json(inspection);
}

export async function uploadPhoto(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new AppError(400, "photo file is required");
  const type = req.body.type as "BEFORE" | "AFTER";
  if (type !== "BEFORE" && type !== "AFTER") throw new AppError(400, "type must be BEFORE or AFTER");

  const photo = await prisma.photo.create({
    data: {
      jobCardId: req.params.id,
      type,
      url: `/uploads/photos/${file.filename}`,
    },
  });
  res.status(201).json(photo);
}
