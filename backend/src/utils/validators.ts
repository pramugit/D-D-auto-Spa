import { z } from "zod";

/**
 * Shared validation/formatting rules, applied consistently across every
 * form-backed endpoint in the system. The frontend has a matching
 * src/utils/validators.ts with the same rules (client-side, for instant
 * feedback and to save a round trip) — this file is the source of
 * truth actually enforced, since client-side validation alone is never
 * sufficient (a client can always be bypassed).
 */

// ---- Names (customer name, staff name, vehicle make/model) ----
// Trim, collapse internal whitespace, reject digits/most punctuation/
// emoji, then title-case each word (respecting hyphens/apostrophes, so
// "mary-jane o'brien" -> "Mary-Jane O'Brien").
const NAME_CHARSET = /^[A-Za-z][A-Za-z\s'-]*$/;

function capitalizeWords(value: string): string {
  return value
    .split(" ")
    .map((word) =>
      word
        .split(/([-'])/)
        .map((part) => (part === "-" || part === "'" ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
        .join("")
    )
    .join(" ");
}

export function nameField(minLength = 1) {
  return z
    .string()
    .transform((val) => val.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(minLength, `Must be at least ${minLength} character${minLength === 1 ? "" : "s"}`)
        .regex(NAME_CHARSET, "Only letters, spaces, hyphens, and apostrophes are allowed")
    )
    .transform(capitalizeWords);
}

// ---- Phone ----
// Digits, spaces, +, - only; a sane minimum length (7 digits is the
// shortest plausible real phone number worldwide).
const PHONE_CHARSET = /^[\d\s+-]+$/;

export function phoneField() {
  return z
    .string()
    .transform((val) => val.trim())
    .pipe(
      z
        .string()
        .regex(PHONE_CHARSET, "Only digits, spaces, +, and - are allowed")
        .refine((val) => val.replace(/[^\d]/g, "").length >= 7, {
          message: "Phone number is too short",
        })
    );
}

// ---- Email ----
export function emailField() {
  return z
    .string()
    .transform((val) => val.trim().toLowerCase())
    .pipe(z.string().email("Must be a valid email address"));
}

export function optionalEmailField() {
  return z
    .string()
    .transform((val) => val.trim().toLowerCase())
    .pipe(z.string().email("Must be a valid email address"))
    .optional()
    .or(z.literal("").transform(() => undefined));
}

// ---- Vehicle plate number ----
// Uppercase letters, digits, and dashes only; auto-uppercased rather
// than rejected for lowercase input (a plate typed in lowercase is a
// formatting nit, not an invalid plate).
const PLATE_CHARSET = /^[A-Z0-9-]+$/;

export function plateNumberField() {
  return z
    .string()
    .transform((val) => val.trim().toUpperCase())
    .pipe(z.string().min(1, "Plate number is required").regex(PLATE_CHARSET, "Only letters, digits, and dashes are allowed"));
}

// ---- Numeric fields (prices, quantities, durations) ----
// Named wrappers purely for call-site clarity/consistency; the actual
// "reject non-numeric input" enforcement for these lives at the
// frontend's <input type="number"> level (Phase E's own requirement) —
// the browser itself refuses non-numeric keystrokes there. These just
// guard the shape server-side regardless of what a client sent.
export function priceField() {
  return z.number().nonnegative("Must be zero or greater");
}

export function positiveNumberField() {
  return z.number().positive("Must be greater than zero");
}

export function durationMinutesField() {
  return z.number().int().positive("Must be a whole number of minutes greater than zero");
}

// ---- Date/time ----
// Always coerced from (and expected to be) an ISO 8601 string — the
// frontend's date/time picker components emit this format natively via
// <input type="date">/<input type="datetime-local">, never free text.
export function isoDateTimeField() {
  return z.coerce.date();
}
