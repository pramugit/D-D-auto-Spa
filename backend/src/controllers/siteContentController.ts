import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";

// Private settings stored in the same table — not readable through this public route.
const PRIVATE_KEYS = new Set(["report-settings", "payroll-settings"]);

export async function get(req: Request, res: Response) {
  if (PRIVATE_KEYS.has(req.params.key)) throw new AppError(404, "Not found");
  const content = await prisma.siteContent.findUnique({ where: { key: req.params.key } });
  res.json(content);
}

export async function update(req: Request, res: Response) {
  const content = await prisma.siteContent.upsert({
    where: { key: req.params.key },
    update: { data: req.body.data },
    create: { key: req.params.key, data: req.body.data },
  });
  res.json(content);
}

export async function uploadImage(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new AppError(400, "image file is required");
  res.status(201).json({ url: `/uploads/content/${file.filename}` });
}
