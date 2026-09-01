/**
 * Shared client-side validation/formatting rules matching backend/src/
 * utils/validators.ts exactly (same regexes, same normalization) — for
 * instant feedback and to save a round trip. The backend re-validates
 * everything regardless; this is never the only enforcement.
 */

const NAME_CHARSET = /^[A-Za-z][A-Za-z\s'-]*$/;
const PHONE_CHARSET = /^[\d\s+-]+$/;
const PLATE_CHARSET = /^[A-Z0-9-]+$/;

export function formatName(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, " ");
  return collapsed
    .split(" ")
    .map((word) =>
      word
        .split(/([-'])/)
        .map((part) => (part === "-" || part === "'" ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
        .join("")
    )
    .join(" ");
}

export function validateName(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return "Required";
  if (!NAME_CHARSET.test(trimmed)) return "Only letters, spaces, hyphens, and apostrophes are allowed";
  return null;
}

export function validatePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!PHONE_CHARSET.test(trimmed)) return "Only digits, spaces, +, and - are allowed";
  if (trimmed.replace(/[^\d]/g, "").length < 7) return "Phone number is too short";
  return null;
}

export function validateEmail(raw: string): string | null {
  const trimmed = raw.trim();
  // Standard, pragmatic email shape check — mirrors zod's .email() closely
  // enough for client-side feedback; the server is the source of truth.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Must be a valid email address";
  return null;
}

export function formatPlateNumber(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validatePlateNumber(raw: string): string | null {
  const formatted = formatPlateNumber(raw);
  if (formatted.length === 0) return "Required";
  if (!PLATE_CHARSET.test(formatted)) return "Only letters, digits, and dashes are allowed";
  return null;
}
