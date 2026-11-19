/**
 * Money display for the whole app — Sri Lankan Rupees.
 * "Rs. 1,250.00" (or "Rs. 1,250" with decimals: "auto" for whole numbers).
 */
export const CURRENCY = "Rs.";

export function formatMoney(
  value: number | string | null | undefined,
  opts: { decimals?: 0 | 2 | "auto" } = {}
): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const d = opts.decimals ?? 2;
  const digits = d === "auto" ? (Number.isInteger(safe) ? 0 : 2) : d;
  return `${CURRENCY} ${safe.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
