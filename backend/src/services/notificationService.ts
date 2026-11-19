import { prisma } from "../utils/prisma";
import type { BookingStatus, Notification, NotificationChannel, NotificationStatus, NotificationType } from "@prisma/client";
import { sendWhatsAppImage, sendWhatsAppText } from "./whatsappClient";
import { sendEmail } from "./emailClient";
import { AppError } from "../utils/AppError";

// Publicly-reachable origin for the backend, used to turn a locally-stored
// upload path ("/uploads/photos/x.jpg") into a URL Meta's servers can
// actually fetch for a WhatsApp image message. localhost works for the
// stub path (nothing is really fetched) but NOT for a live send — point
// this at a tunnel (ngrok, etc.) or your real deployment's URL to send
// real photos over WhatsApp.
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT ?? 4001}`;

function toPublicUrl(path: string): string {
  return `${PUBLIC_BASE_URL}${path}`;
}

/**
 * SMS/EMAIL stay stubs (log + mark SENT) — swap in Twilio/SendGrid
 * wherever noted in the README. WHATSAPP is a real send via
 * whatsappClient.ts when WHATSAPP_API_TOKEN/WHATSAPP_PHONE_NUMBER_ID are
 * configured, falling back to the same log-and-succeed stub otherwise so
 * local dev keeps working without a WhatsApp Business account.
 */
async function sendNotification(
  notification: Notification,
  imageUrl?: string,
  to?: string,
  subject?: string
): Promise<NotificationStatus> {
  // A real email when an address is given (booking requests); the older
  // EMAIL/SMS milestone notifications without one stay log-only stubs.
  if (notification.channel === "EMAIL" && to) {
    try {
      await sendEmail(to, subject || "D & D Auto Spa", notification.message);
      await prisma.notification.update({ where: { id: notification.id }, data: { status: "SENT" } });
      return "SENT";
    } catch (err) {
      console.error(`[email] send failed for notification ${notification.id}:`, err);
      await prisma.notification.update({ where: { id: notification.id }, data: { status: "FAILED" } });
      return "FAILED";
    }
  }
  if (notification.channel !== "WHATSAPP") {
    console.log(`[notification stub] ${notification.channel} -> customer ${notification.customerId}: ${notification.message}`);
    await prisma.notification.update({ where: { id: notification.id }, data: { status: "SENT" } });
    return "SENT";
  }

  const customer = to
    ? { phone: to }
    : await prisma.customer.findUnique({
        where: { id: notification.customerId },
        select: { phone: true },
      });
  if (!customer?.phone) {
    console.error(`[whatsapp] customer ${notification.customerId} has no phone on file — cannot send`);
    await prisma.notification.update({ where: { id: notification.id }, data: { status: "FAILED" } });
    return "FAILED";
  }

  try {
    if (imageUrl) {
      await sendWhatsAppImage(customer.phone, imageUrl, notification.message);
    } else {
      await sendWhatsAppText(customer.phone, notification.message);
    }
    await prisma.notification.update({ where: { id: notification.id }, data: { status: "SENT" } });
    return "SENT";
  } catch (err) {
    console.error(`[whatsapp] send failed for notification ${notification.id}:`, err);
    await prisma.notification.update({ where: { id: notification.id }, data: { status: "FAILED" } });
    return "FAILED";
  }
}

export async function createAndSendNotification(input: {
  customerId: string;
  type: NotificationType;
  message: string;
  channel: NotificationChannel;
  /** WHATSAPP only — sent as an image message with `message` as the caption. */
  imageUrl?: string;
  /** Send to this WhatsApp number / email address instead of the customer's own phone. */
  to?: string;
  /** EMAIL only. */
  subject?: string;
}): Promise<Notification> {
  const { imageUrl, to, subject, ...data } = input;
  const notification = await prisma.notification.create({
    data: { ...data, status: "PENDING" },
  });
  const status = await sendNotification(notification, imageUrl, to, subject);
  return { ...notification, status };
}

const STATUS_LABELS: Partial<Record<BookingStatus, string>> = {
  PENDING: "Received",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In Progress",
  QUALITY_CHECK: "Quality Check",
  READY: "Ready for pickup",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * WhatsApp progress update, composed from a booking's customer/vehicle and
 * — for IN_PROGRESS — its job card's assigned technicians and most recent
 * photo (AFTER preferred, falling back to whatever was uploaded most
 * recently). When a photo exists it's sent as a real WhatsApp image
 * message (message text becomes the caption) rather than a text link.
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
  let technicianNames: string[] = [];
  if (jobCardId) {
    const afterPhoto = await prisma.photo.findFirst({
      where: { jobCardId, type: "AFTER" },
      orderBy: { uploadedAt: "desc" },
    });
    const anyPhoto =
      afterPhoto ?? (await prisma.photo.findFirst({ where: { jobCardId }, orderBy: { uploadedAt: "desc" } }));
    photoUrl = anyPhoto?.url ?? null;

    if (newStatus === "IN_PROGRESS") {
      const assignments = await prisma.jobCardTechnician.findMany({
        where: { jobCardId },
        include: { user: { select: { name: true } } },
      });
      technicianNames = assignments.map((a) => a.user.name);
    }
  }

  const statusLabel = STATUS_LABELS[newStatus] ?? newStatus;
  let message = `Hi ${booking.customer.name}, your ${booking.vehicle.make} ${booking.vehicle.model} (${booking.vehicle.plateNumber}) is now: ${statusLabel}.`;
  if (technicianNames.length > 0) {
    message += ` ${technicianNames.join(" and ")} ${technicianNames.length > 1 ? "are" : "is"} working on it.`;
  }

  return createAndSendNotification({
    customerId: booking.customerId,
    type,
    message,
    channel: "WHATSAPP",
    imageUrl: photoUrl ? toPublicUrl(photoUrl) : undefined,
  });
}

/**
 * WhatsApp sent the moment a technician (or technicians) is assigned to a
 * job card — independent of any status transition, since assignment can
 * happen ahead of or after a booking reaches CONFIRMED/IN_PROGRESS. Fired
 * from jobCardController.assignTechnicians on every (re)assignment.
 */
export async function sendTechnicianAssignedWhatsApp(
  booking: {
    customerId: string;
    customer: { name: string };
    vehicle: { make: string; model: string; plateNumber: string };
  },
  technicianNames: string[]
) {
  const names = technicianNames.join(" and ");
  const message = `Hi ${booking.customer.name}, ${names} ${
    technicianNames.length > 1 ? "have" : "has"
  } been assigned to your ${booking.vehicle.make} ${booking.vehicle.model} (${booking.vehicle.plateNumber}). We'll let you know once work begins.`;

  return createAndSendNotification({
    customerId: booking.customerId,
    type: "TECHNICIAN_ASSIGNED",
    message,
    channel: "WHATSAPP",
  });
}

/**
 * On-demand WhatsApp photo send — a technician sharing one specific work
 * photo with the customer right away, rather than waiting for the next
 * automatic status-transition update. Triggered from the job card's
 * Photos section (POST /job-cards/:id/photos/:photoId/send-whatsapp).
 */
export async function sendJobPhotoWhatsApp(
  booking: {
    customerId: string;
    customer: { name: string };
    vehicle: { make: string; model: string; plateNumber: string };
  },
  photoUrl: string
) {
  const message = `Hi ${booking.customer.name}, here's an update photo of your ${booking.vehicle.make} ${booking.vehicle.model} (${booking.vehicle.plateNumber}).`;

  return createAndSendNotification({
    customerId: booking.customerId,
    type: "PHOTO_UPDATE",
    message,
    channel: "WHATSAPP",
    imageUrl: toPublicUrl(photoUrl),
  });
}

/**
 * The Job Board's one-click "Send Images" button — sends the job card's
 * latest work photo (AFTER preferred, falling back to whatever was
 * uploaded most recently) to the customer over WhatsApp, captioned with
 * the job's current status. Distinct from sendJobPhotoWhatsApp, which
 * sends one specific photo the technician picked from the detail page;
 * this one needs no photoId — it just grabs the latest.
 */
export async function sendLatestJobPhotoWhatsApp(
  booking: {
    customerId: string;
    customer: { name: string };
    vehicle: { make: string; model: string; plateNumber: string };
  },
  jobCardId: string,
  status: BookingStatus
) {
  const afterPhoto = await prisma.photo.findFirst({
    where: { jobCardId, type: "AFTER" },
    orderBy: { uploadedAt: "desc" },
  });
  const photo = afterPhoto ?? (await prisma.photo.findFirst({ where: { jobCardId }, orderBy: { uploadedAt: "desc" } }));
  if (!photo) throw new AppError(400, "No photos uploaded for this job card yet");

  const statusLabel = STATUS_LABELS[status] ?? status;
  const message = `Hi ${booking.customer.name}, here's the latest photo of your ${booking.vehicle.make} ${booking.vehicle.model} (${booking.vehicle.plateNumber}) — ${statusLabel}.`;

  return createAndSendNotification({
    customerId: booking.customerId,
    type: "PHOTO_UPDATE",
    message,
    channel: "WHATSAPP",
    imageUrl: toPublicUrl(photo.url),
  });
}
