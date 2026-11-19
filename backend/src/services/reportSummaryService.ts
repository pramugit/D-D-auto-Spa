import { prisma } from "../utils/prisma";
import { getBayUtilization, getProfitOverTime, getRepeatCustomerRate } from "./reportService";
import { getOverview as getInventoryOverview } from "./inventoryService";
import { sendWhatsAppText, isWhatsAppLive } from "./whatsappClient";
import { AppError } from "../utils/AppError";

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
const money = (n: number) =>
  `Rs. ${round2(n).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(round2(n)) ? 0 : 2, maximumFractionDigits: 2 })}`;

async function periodTotals(from: Date, to: Date) {
  const [payments, jobs, newCustomers] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "VERIFIED", createdAt: { gte: from, lt: to } },
      select: {
        amount: true,
        createdAt: true,
        method: true,
        invoice: { select: { jobCard: { select: { booking: { select: { isWalkIn: true } } } } } },
      },
    }),
    prisma.jobCard.findMany({
      where: { status: "COMPLETED", completedAt: { gte: from, lt: to } },
      select: {
        startedAt: true,
        completedAt: true,
        invoice: { select: { total: true } },
        booking: {
          select: {
            isWalkIn: true,
            services: { select: { price: true, service: { select: { name: true } }, package: { select: { name: true } } } },
          },
        },
        technicians: { select: { user: { select: { id: true, name: true } } } },
      },
    }),
    prisma.customer.count({ where: { createdAt: { gte: from, lt: to } } }),
  ]);
  const revenue = round2(payments.reduce((s, p) => s + Number(p.amount), 0));
  return { payments, jobs, newCustomers, revenue };
}

/**
 * Everything the Reports page shows for one period, compared with the
 * period of the same length just before it, plus plain-language insights
 * worked out from the numbers (so nobody has to read the charts to know
 * what changed).
 */
export async function getReportSummary(from: Date, to: Date) {
  const len = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - len);

  const [cur, prev, profit, bays, repeat, inventory, openInvoices, pendingTransfers, workNow] = await Promise.all([
    periodTotals(from, to),
    periodTotals(prevFrom, from),
    getProfitOverTime(from, to),
    getBayUtilization(from, to),
    getRepeatCustomerRate(),
    getInventoryOverview(),
    prisma.invoice.findMany({
      where: { status: { not: "PAID" } },
      select: { total: true, payments: { where: { status: "VERIFIED" }, select: { amount: true } } },
    }),
    prisma.payment.count({ where: { status: "PENDING_VERIFICATION" } }),
    prisma.jobCard.groupBy({ by: ["status"], where: { status: { notIn: ["COMPLETED", "CANCELLED"] } }, _count: { _all: true } }),
  ]);

  const jobsDaily = cur.jobs.filter((j) => j.booking.isWalkIn).length;
  const jobsBooking = cur.jobs.length - jobsDaily;
  const jobValue = cur.jobs.reduce((s, j) => s + Number(j.invoice?.total ?? 0), 0);
  const avgJob = cur.jobs.length ? round2(jobValue / cur.jobs.length) : 0;

  // Top services by income from completed jobs.
  const svc = new Map<string, { name: string; count: number; revenue: number }>();
  for (const j of cur.jobs)
    for (const s of j.booking.services) {
      const name = s.package?.name ?? s.service?.name ?? "Other";
      const e = svc.get(name) ?? { name, count: 0, revenue: 0 };
      e.count++;
      e.revenue = round2(e.revenue + Number(s.price));
      svc.set(name, e);
    }
  const topServices = [...svc.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  // Technicians: jobs completed and average start→finish time in this period.
  const tech = new Map<string, { name: string; jobs: number; minutes: number; timed: number }>();
  for (const j of cur.jobs)
    for (const t of j.technicians) {
      const e = tech.get(t.user.id) ?? { name: t.user.name, jobs: 0, minutes: 0, timed: 0 };
      e.jobs++;
      if (j.startedAt && j.completedAt) {
        e.minutes += (j.completedAt.getTime() - j.startedAt.getTime()) / 60000;
        e.timed++;
      }
      tech.set(t.user.id, e);
    }
  const technicians = [...tech.values()]
    .map((t) => ({ name: t.name, jobs: t.jobs, avgMinutes: t.timed ? Math.round(t.minutes / t.timed) : null }))
    .sort((a, b) => b.jobs - a.jobs);

  const byMethod: Record<string, number> = {};
  for (const p of cur.payments) byMethod[p.method] = round2((byMethod[p.method] ?? 0) + Number(p.amount));

  let outstanding = 0;
  let outstandingCount = 0;
  for (const inv of openInvoices) {
    const due = Number(inv.total) - inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    if (due > 0) {
      outstanding += due;
      outstandingCount++;
    }
  }

  const inProgress = Object.fromEntries(workNow.map((w) => [w.status, w._count._all]));
  const lowStock = inventory.items.filter((i) => i.status !== "OK");

  // ── Insights ──
  type Insight = { tone: "good" | "bad" | "info"; text: string };
  const insights: Insight[] = [];
  const revChange = pct(cur.revenue, prev.revenue);
  if (revChange !== null)
    insights.push({
      tone: revChange >= 0 ? "good" : "bad",
      text: `Revenue is ${revChange >= 0 ? "up" : "down"} ${Math.abs(revChange)}% on the previous period (${money(cur.revenue)} vs ${money(prev.revenue)}).`,
    });
  else if (cur.revenue > 0) insights.push({ tone: "good", text: `${money(cur.revenue)} received — nothing in the previous period to compare with.` });
  else insights.push({ tone: "info", text: "No payments received in this period yet." });

  const jobChange = pct(cur.jobs.length, prev.jobs.length);
  if (jobChange !== null && jobChange !== 0)
    insights.push({
      tone: jobChange > 0 ? "good" : "bad",
      text: `${cur.jobs.length} jobs completed — ${jobChange > 0 ? "up" : "down"} ${Math.abs(jobChange)}% (${jobsDaily} daily, ${jobsBooking} booked).`,
    });
  if (topServices[0]) insights.push({ tone: "info", text: `Top earner: ${topServices[0].name} — ${money(topServices[0].revenue)} from ${topServices[0].count} job(s).` });
  if (technicians[0]) insights.push({ tone: "info", text: `Busiest technician: ${technicians[0].name} with ${technicians[0].jobs} completed job(s).` });
  if (profit.revenue > 0 && profit.materialCost + profit.laborCost === 0) {
    insights.push({
      tone: "info",
      text: "Profit can't be worked out yet: no material or labour costs are recorded (add stock costs in Inventory and salaries in Payroll).",
    });
  } else if (profit.revenue > 0) {
    const margin = Math.round((profit.profit / profit.revenue) * 100);
    insights.push({ tone: margin >= 30 ? "good" : margin < 10 ? "bad" : "info", text: `Profit ${money(profit.profit)} on invoiced work — a ${margin}% margin after materials and labour.` });
  }
  for (const b of bays) if (len >= 6 * 86400000 && b.utilizationRate < 20) insights.push({ tone: "bad", text: `${b.name} was only ${b.utilizationRate}% used — room for more bookings.` });
  if (outstandingCount) insights.push({ tone: "bad", text: `${money(outstanding)} still unpaid across ${outstandingCount} invoice(s).` });
  if (pendingTransfers) insights.push({ tone: "bad", text: `${pendingTransfers} bank transfer(s) waiting for verification.` });
  if (lowStock.length) insights.push({ tone: "bad", text: `${lowStock.length} stock item(s) need reordering — see Inventory → Reorder.` });
  if (cur.newCustomers) insights.push({ tone: "good", text: `${cur.newCustomers} new customer(s) this period.` });

  return {
    from,
    to,
    kpis: {
      revenue: { value: cur.revenue, prev: prev.revenue, change: revChange },
      jobs: { value: cur.jobs.length, prev: prev.jobs.length, change: jobChange, daily: jobsDaily, booking: jobsBooking },
      avgJob: { value: avgJob },
      newCustomers: { value: cur.newCustomers, prev: prev.newCustomers, change: pct(cur.newCustomers, prev.newCustomers) },
      profit: { value: profit.profit, revenue: profit.revenue, materialCost: profit.materialCost, laborCost: profit.laborCost },
      repeatRate: repeat.repeatRate,
    },
    payments: cur.payments.map((p) => ({ createdAt: p.createdAt, amount: Number(p.amount), isWalkIn: p.invoice.jobCard.booking.isWalkIn })),
    byMethod,
    topServices,
    technicians,
    bays,
    alerts: {
      outstanding: round2(outstanding),
      outstandingCount,
      pendingTransfers,
      lowStock: lowStock.map((i) => i.name),
      waiting: inProgress.CONFIRMED ?? 0,
      inProgress: (inProgress.IN_PROGRESS ?? 0) + (inProgress.QUALITY_CHECK ?? 0),
      ready: inProgress.READY ?? 0,
    },
    insights,
  };
}

// ── Automatic daily report on WhatsApp ───────────────────────────────────
const SETTINGS_KEY = "report-settings";

export interface DailyReportSettings {
  enabled: boolean;
  whatsappNumber: string;
  hour: number; // 0-23, shop local time
  lastSentDate?: string | null; // YYYY-MM-DD
}

const DEFAULT_SETTINGS: DailyReportSettings = { enabled: false, whatsappNumber: "", hour: 19, lastSentDate: null };

export async function getDailySettings(): Promise<DailyReportSettings> {
  const row = await prisma.siteContent.findUnique({ where: { key: SETTINGS_KEY } });
  return { ...DEFAULT_SETTINGS, ...((row?.data as Partial<DailyReportSettings> | null) ?? {}) };
}

export async function saveDailySettings(patch: Partial<DailyReportSettings>) {
  const next = { ...(await getDailySettings()), ...patch };
  if (next.enabled && !next.whatsappNumber.trim()) throw new AppError(400, "Enter the WhatsApp number to send the daily report to");
  await prisma.siteContent.upsert({
    where: { key: SETTINGS_KEY },
    update: { data: next as object },
    create: { key: SETTINGS_KEY, data: next as object },
  });
  return next;
}

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Today's report as a WhatsApp-ready message. */
export async function buildDailyReportText(now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = await getReportSummary(from, to);
  const k = s.kpis;
  const change = (c: number | null) => (c === null ? "" : ` (${c >= 0 ? "▲" : "▼"}${Math.abs(c)}% vs yesterday)`);
  const lines = [
    `*D & D Auto Spa — daily report ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}*`,
    "",
    `💰 Revenue: ${money(k.revenue.value)}${change(k.revenue.change)}`,
    `🚗 Jobs completed: ${k.jobs.value} (${k.jobs.daily} daily, ${k.jobs.booking} booked)${change(k.jobs.change)}`,
    `🧾 Average job: ${money(k.avgJob.value)}`,
    `👤 New customers: ${k.newCustomers.value}`,
  ];
  if (s.topServices[0]) lines.push(`⭐ Top service: ${s.topServices[0].name} (${money(s.topServices[0].revenue)})`);
  const methods = Object.entries(s.byMethod).map(([m, v]) => `${m.replace("_", " ").toLowerCase()} ${money(v)}`);
  if (methods.length) lines.push(`💳 Received: ${methods.join(", ")}`);
  lines.push("", "*Still open*");
  lines.push(`Waiting ${s.alerts.waiting} · In progress ${s.alerts.inProgress} · Ready ${s.alerts.ready}`);
  if (s.alerts.outstandingCount) lines.push(`⚠ Unpaid: ${money(s.alerts.outstanding)} (${s.alerts.outstandingCount} invoices)`);
  if (s.alerts.pendingTransfers) lines.push(`⚠ ${s.alerts.pendingTransfers} bank transfer(s) to verify`);
  if (s.alerts.lowStock.length) lines.push(`⚠ Reorder: ${s.alerts.lowStock.slice(0, 6).join(", ")}${s.alerts.lowStock.length > 6 ? "…" : ""}`);
  return lines.join("\n");
}

export async function sendDailyReport(toOverride?: string) {
  const settings = await getDailySettings();
  const to = (toOverride ?? settings.whatsappNumber).trim();
  if (!to) throw new AppError(400, "Set the WhatsApp number for the daily report first");
  const text = await buildDailyReportText();
  await sendWhatsAppText(to, text);
  return { text, sentTo: to, live: isWhatsAppLive() };
}

/**
 * Checks once a minute; at the chosen hour (shop local time) it sends the
 * day's report once and records the date so it never sends twice.
 */
export function startDailyReportScheduler() {
  const tick = async () => {
    try {
      const s = await getDailySettings();
      const now = new Date();
      const today = localDate(now);
      if (!s.enabled || !s.whatsappNumber || now.getHours() !== s.hour || s.lastSentDate === today) return;
      await saveDailySettings({ lastSentDate: today }); // claim first, so a slow send can't double-fire
      await sendDailyReport();
      console.log(`[reports] daily report sent for ${today}`);
    } catch (err) {
      console.error("[reports] daily report failed:", err);
    }
  };
  setInterval(tick, 60_000);
}
