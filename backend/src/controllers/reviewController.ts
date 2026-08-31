import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

export async function create(req: Request, res: Response) {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: req.params.id },
    include: { booking: true, review: true },
  });
  if (!jobCard) throw new AppError(404, "Job card not found");
  if (jobCard.booking.status !== "COMPLETED") {
    throw new AppError(409, "A review can only be left after the job is completed");
  }
  if (req.user?.type === "customer" && jobCard.booking.customerId !== req.user.sub) {
    throw new AppError(403, "Not your job card");
  }
  if (jobCard.review) {
    throw new AppError(409, "A review already exists for this job card");
  }

  const review = await prisma.review.create({
    data: {
      jobCardId: req.params.id,
      rating: req.body.rating,
      comment: req.body.comment,
    },
  });
  res.status(201).json(review);
}

export async function get(req: Request, res: Response) {
  const review = await prisma.review.findUnique({ where: { jobCardId: req.params.id } });
  if (!review) throw new AppError(404, "No review for this job card");
  res.json(review);
}
