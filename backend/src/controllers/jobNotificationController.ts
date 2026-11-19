import type { Request, Response } from "express";
import { checkOverduePhotoNotifications, listJobNotifications } from "../services/jobNotificationService";

export async function list(_req: Request, res: Response) {
  await checkOverduePhotoNotifications();
  const notifications = await listJobNotifications();
  res.json(notifications);
}
