import { prisma } from "../utils/prisma";
import type { BookingStatus, Notification, NotificationChannel, NotificationType } from "@prisma/client";

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

const STATUS_LABELS: Partial<Record<BookingStatus, string>> = {
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In Progress",
  QUALITY_CHECK: "Quality Check",
  READY: "Ready for pickup",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * WhatsApp progress update with an optional photo link, composed from a
 * booking's customer/vehicle and its job card's most recent photo (AFTER
 * preferred, falling back to whatever was uploaded most recently). Logs
 * the composed message and marks the Notification record SENT, exactly
 * like sendNotification above — a real integration (Twilio's WhatsApp
 * API or the Meta Cloud API) plugs in here instead; this is not a live
 * send.
 */
export async function sendWhatsAppProgressUpdate(
  booking: {
    id: string;
    customerId: string;
    customer: { name: string };
    vehicle: { make: string; model: string; plateNumber: string };
  },
  jobCardId: string | null,
  newStatus: BookingStatus,
  type: NotificationType
) {
  let photoUrl: string | null = null;
  if (jobCardId) {
    const afterPhoto = await prisma.photo.findFirst({
      where: { jobCardId, type: "AFTER" },
      orderBy: { uploadedAt: "desc" },
    });
    const anyPhoto =
      afterPhoto ?? (await prisma.photo.findFirst({ where: { jobCardId }, orderBy: { uploadedAt: "desc" } }));
    photoUrl = anyPhoto?.url ?? null;
  }

  const statusLabel = STATUS_LABELS[newStatus] ?? newStatus;
  let message = `Hi ${booking.customer.name}, your ${booking.vehicle.make} ${booking.vehicle.model} (${booking.vehicle.plateNumber}) is now: ${statusLabel}.`;
  if (photoUrl) {
    message += ` Photo: ${photoUrl}`;
  }

  return createAndSendNotification({
    customerId: booking.customerId,
    type,
    message,
    channel: "WHATSAPP",
  });
}
