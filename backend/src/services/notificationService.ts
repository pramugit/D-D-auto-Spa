import { prisma } from "../utils/prisma";
import type { Notification, NotificationChannel, NotificationType } from "@prisma/client";

/**
 * Stub notification dispatcher. In production, plug in a real provider
 * here — e.g. Twilio for SMS, SendGrid/Postmark for email — and update
 * the record's status to SENT (or a FAILED state) based on the result.
 * For this pass it just logs and marks the record SENT immediately.
 */
async function sendNotification(notification: Notification): Promise<void> {
  console.log(`[notification stub] ${notification.channel} -> customer ${notification.customerId}: ${notification.message}`);
  await prisma.notification.update({ where: { id: notification.id }, data: { status: "SENT" } });
}

export async function createAndSendNotification(input: {
  customerId: string;
  type: NotificationType;
  message: string;
  channel: NotificationChannel;
}) {
  const notification = await prisma.notification.create({
    data: { ...input, status: "PENDING" },
  });
  await sendNotification(notification);
  return notification;
}
