import { AppError } from "../utils/AppError";

// Meta WhatsApp Cloud API client. Configure via env vars:
//   WHATSAPP_API_TOKEN        - permanent/system-user access token from Meta
//   WHATSAPP_PHONE_NUMBER_ID  - the sending number's Phone Number ID
//   WHATSAPP_API_VERSION      - Graph API version (default v20.0)
//   WHATSAPP_DEFAULT_COUNTRY_CODE - country code (no +) used to expand
//     locally-stored phone numbers like "0771234567" into international
//     form ("94771234567"); default "94" (Sri Lanka)
//
// Without WHATSAPP_API_TOKEN + WHATSAPP_PHONE_NUMBER_ID set, every send
// here falls back to a console.log stub so the rest of the app keeps
// working in local dev with no WhatsApp account at all.
//
// Real-world constraints this client does NOT work around (Meta's rules,
// not ours):
//  - A phone number can only ever be reached by messages your app is
//    allowed to send it: either free-form text/image within a 24-hour
//    window after the CUSTOMER messages your business number first, or
//    an approved message template at any time. Meta's test setup lets
//    you free-form message a handful of verified recipient numbers
//    without a template, which is enough to test this end-to-end before
//    Meta approves your business/templates for production.
//  - Image messages need a publicly reachable HTTPS URL (Meta's servers
//    fetch it) — see PUBLIC_BASE_URL in notificationService.ts. A photo
//    served from localhost will fail; use a tunnel (ngrok, etc.) or a
//    real deployment.

const GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || "v20.0";

export function isWhatsAppLive(): boolean {
  return !!(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Expands a locally-formatted number ("071 234 5678") into the
 *  digits-only international form Meta's API requires ("94712345678"). */
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    const countryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "94";
    return `${countryCode}${digits.slice(1)}`;
  }
  return digits;
}

async function callGraphApi(body: Record<string, unknown>) {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });

  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    const detail = data.error?.message ?? res.statusText;
    throw new AppError(502, `WhatsApp send failed: ${detail}`);
  }
  return data;
}

export async function sendWhatsAppText(toPhone: string, message: string) {
  if (!isWhatsAppLive()) {
    console.log(`[whatsapp stub] -> ${toPhone}: ${message}`);
    return { stub: true };
  }
  return callGraphApi({ to: toWhatsAppNumber(toPhone), type: "text", text: { body: message } });
}

export async function sendWhatsAppImage(toPhone: string, imageUrl: string, caption?: string) {
  if (!isWhatsAppLive()) {
    console.log(`[whatsapp stub] -> ${toPhone}: [image ${imageUrl}] ${caption ?? ""}`);
    return { stub: true };
  }
  return callGraphApi({
    to: toWhatsAppNumber(toPhone),
    type: "image",
    image: { link: imageUrl, caption },
  });
}
