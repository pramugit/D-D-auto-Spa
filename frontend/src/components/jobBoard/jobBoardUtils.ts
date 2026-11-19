import type { BookingStatus, InvoiceStatus, JobCard } from "../../api/types";

/** Look of each stage — the colour stripe / dot used on cards, columns and badges. */
export const STAGE_STYLE: Record<string, { dot: string; stripe: string; text: string; soft: string }> = {
  CONFIRMED: { dot: "bg-sky-400", stripe: "border-t-sky-500", text: "text-sky-300", soft: "bg-sky-950/60 text-sky-300" },
  IN_PROGRESS: { dot: "bg-amber-400", stripe: "border-t-amber-500", text: "text-amber-300", soft: "bg-amber-950/60 text-amber-300" },
  QUALITY_CHECK: { dot: "bg-violet-400", stripe: "border-t-violet-500", text: "text-violet-300", soft: "bg-violet-950/60 text-violet-300" },
  READY: { dot: "bg-emerald-400", stripe: "border-t-emerald-500", text: "text-emerald-300", soft: "bg-emerald-950/60 text-emerald-300" },
  COMPLETED: { dot: "bg-neutral-400", stripe: "border-t-neutral-500", text: "text-neutral-300", soft: "bg-neutral-800 text-neutral-300" },
  CANCELLED: { dot: "bg-red-500", stripe: "border-t-red-700", text: "text-red-400", soft: "bg-red-950 text-red-400" },
};

export const STAGE_ORDER: BookingStatus[] = ["CONFIRMED", "IN_PROGRESS", "QUALITY_CHECK", "READY", "COMPLETED"];

/** How long a job may sit in a stage before it's flagged (minutes). */
const STAGE_LIMIT_MIN: Partial<Record<BookingStatus, number>> = {
  IN_PROGRESS: 180,
  QUALITY_CHECK: 45,
  READY: 120,
};

export const INVOICE_BADGE: Record<InvoiceStatus, { label: string; cls: string }> = {
  PAID: { label: "Paid", cls: "bg-emerald-950 text-emerald-300" },
  PARTIALLY_PAID: { label: "Part paid", cls: "bg-amber-950 text-amber-300" },
  UNPAID: { label: "Unpaid", cls: "bg-red-950 text-red-300" },
};

/** When the job entered its current stage. */
export function stageSince(j: JobCard): string {
  const log = j.booking.activityLogs?.[0];
  if (log && log.toStatus === j.status) return log.createdAt;
  if (j.status === "COMPLETED" && j.completedAt) return j.completedAt;
  if (j.status === "IN_PROGRESS" && j.startedAt) return j.startedAt;
  return j.booking.createdAt;
}

export function minutesInStage(j: JobCard, now: number): number {
  return Math.max(0, Math.floor((now - new Date(stageSince(j)).getTime()) / 60000));
}

export function fmtDuration(min: number): string {
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export type Flag = { key: string; label: string; tone: "red" | "amber" };

/** Things a manager should look at — drives the badges and "Needs attention" filter. */
export function jobFlags(j: JobCard, now: number): Flag[] {
  const flags: Flag[] = [];
  if (j.status === "COMPLETED" || j.status === "CANCELLED") return flags;
  if (j.status === "CONFIRMED" && new Date(j.booking.scheduledAt).getTime() < now - 15 * 60000) {
    flags.push({ key: "late", label: "Late start", tone: "red" });
  }
  if (j.technicians.length === 0) flags.push({ key: "unassigned", label: "No technician", tone: "amber" });
  const limit = STAGE_LIMIT_MIN[j.status];
  if (limit && minutesInStage(j, now) > limit) flags.push({ key: "slow", label: "Long in stage", tone: "red" });
  if (j.status === "READY") {
    if (!j.invoice) flags.push({ key: "noinvoice", label: "No invoice", tone: "amber" });
    else if (j.invoice.status !== "PAID") flags.push({ key: "unpaid", label: "Awaiting payment", tone: "amber" });
  }
  return flags;
}

/** Invoice total if there is one, otherwise the booked services' prices. */
export function jobValue(j: JobCard): number {
  if (j.invoice) return Number(j.invoice.total);
  return (j.booking.services ?? []).reduce((s, x) => s + Number(x.price), 0);
}

export function serviceNames(j: JobCard): string[] {
  return (j.booking.services ?? []).map((s) => s.service?.name ?? s.package?.name ?? "Service");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export const money = (n: number) => `Rs. ${n.toLocaleString("en-LK", { maximumFractionDigits: 0 })}`;

export function startOfToday(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  const s = startOfToday();
  return t >= s && t < s + 86_400_000;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return isToday(iso) ? `Today ${time}` : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}
