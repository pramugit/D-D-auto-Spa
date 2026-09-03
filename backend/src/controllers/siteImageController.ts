import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

export const GALLERY_SLOTS = 7;

export async function list(_req: Request, res: Response) {
  const images = await prisma.siteImage.findMany({ orderBy: { slot: "asc" } });
  res.json(images);
}

export async function replace(req: Request, res: Response) {
  const slot = Number(req.params.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > GALLERY_SLOTS) {
    throw new AppError(400, `slot must be between 1 and ${GALLERY_SLOTS}`);
  }
  const file = req.file;
  if (!file) throw new AppError(400, "image file is required");

  const image = await prisma.siteImage.upsert({
    where: { slot },
    update: { url: `/uploads/gallery/${file.filename}` },
    create: { slot, url: `/uploads/gallery/${file.filename}` },
  });
  res.json(image);
}
