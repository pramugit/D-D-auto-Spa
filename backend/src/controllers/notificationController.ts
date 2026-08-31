import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { createAndSendNotification } from "../services/notificationService";

export async function create(req: Request, res: Response) {
  const notification = await createAndSendNotification(req.body);
  res.status(201).json(notification);
}

export async function list(req: Request, res: Response) {
  const where: Record<string, unknown> = {};
  if (req.user?.type === "customer") {
    where.customerId = req.user.sub;
  } else if (typeof req.query.customerId === "string") {
    where.customerId = req.query.customerId;
  }
  const notifications = await prisma.notification.findMany({ where, orderBy: { createdAt: "desc" } });
  res.json(notifications);
}
