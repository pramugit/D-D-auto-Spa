import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as reportsApi from "../api/reports";
import type { DailyReportSettings, ReportSummary } from "../api/reports";
import { apiErrorMessage } from "../api/client";

// Single-series charts in the brand red on black.
const RED = "#e5484d";
const GRID = "#262626";
const AXIS = "#8a8a8a";

type PeriodKey = "today" | "7d" | "month" | "3m" | "12m";
type Bucket = "hour" | "day" | "week" | "month";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "month", label: "This month" },
  { key: "3m", label: "3 months" },
  { key: "12m", label: "12 months" },
];

const REFRESH_MS = 60_000;

function periodRange(key: PeriodKey): { from: Date; to: Date; bucket: Bucket; prevLabel: string } {
  const n = new Date();
  const [y, m, d] = [n.getFullYear(), n.getMonth(), n.getDate()];
  const to = new Date(y, m, d + 1);
  switch (key) {
    case "today":
      return { from: new Date(y, m, d), to, bucket: "hour", prevLabel: "yesterday" };
    case "7d":
      return { from: new Date(y, m, d - 6), to, bucket: "day", prevLabel: "previous 7 days" };
    case "month":
      return { from: new Date(y, m, 1), to, bucket: "day", prevLabel: "same length before" };
    case "3m":
      return { from: new Date(y, m - 2, 1), to, bucket: "week", prevLabel: "previous 3 months" };
    case "12m":
      return { from: new Date(y, m - 11, 1), to, bucket: "month", prevLabel: "previous 12 months" };
  }
}

function bucketStart(dt: Date, b: Bucket) {
  if (b === "hour") return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours());
  if (b === "day") return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  if (b === "week") return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - ((dt.getDay() + 6) % 7));
  return new Date(dt.getFullYear(), dt.getMonth(), 1);
}
function nextBucket(dt: Date, b: Bucket) {
  const x = new Date(dt);
  if (b === "hour") x.setHours(x.getHours() + 1);
  else if (b === "day") x.setDate(x.getDate() + 1);
  else if (b === "week") x.setDate(x.getDate() + 7);
  else x.setMonth(x.getMonth() + 1);
  return x;
}
function bucketLabel(dt: Date, b: Bucket) {
  if (b === "hour") return `${String(dt.getHours()).padStart(2, "0")}:00`;
  if (b === "day") return dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (b === "week") return `Wk ${dt.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  return dt.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

const money = (n: number) =>
  `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

const METHOD_LABEL: Record<string, string> = { CASH: "Cash", QR: "QR", BANK_TRANSFER: "Bank transfer", CARD: "Card" };

/**
 * Reports — automatic: one summary per period (compared with the period
 * before), plain-language insights, a self-refreshing view, CSV/print
 * export, and an optional daily report sent to the owner on WhatsApp.
 */
export function ReportsPage() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [data, setData] = useState<ReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [live, setLive] = useState(true);

  const range = useMemo(() => periodRange(period), [period]);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const r = periodRange(period); // recomputed so "today" rolls over at midnight
        setData(await reportsApi.getReportSummary(r.from, r.to));
        setUpdatedAt(new Date());
        setError(null);
      } catch (err) {
        setError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [period]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh while the tab is visible.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [live, load]);

  const chart = useMemo(() => {
    if (!data) return [];
    const rows: { label: string; revenue: number }[] = [];
    const idx = new Map<number, number>();
    for (let b = bucketStart(range.from, range.bucket); b < range.to; b = nextBucket(b, range.bucket)) {
      idx.set(b.getTime(), rows.length);
      rows.push({ label: bucketLabel(b, range.bucket), revenue: 0 });
    }
    for (const p of data.payments) {
      const i = idx.get(bucketStart(new Date(p.createdAt), range.bucket).getTime());
      if (i !== undefined) rows[i].revenue = Math.round((rows[i].revenue + p.amount) * 100) / 100;
    }
    if (range.bucket === "hour") {
      const used = rows.flatMap((r, i) => (r.revenue ? [i] : []));
      return rows.slice(Math.min(8, ...used), Math.max(18, ...used) + 1);
    }
    return rows;
  }, [data, range]);

  function exportCsv() {
    if (!data) return;
    const k = data.kpis;
    const lines = [
      ["D & D Auto Spa report", `${range.from.toLocaleDateString()} – ${new Date(range.to.getTime() - 1).toLocaleDateString()}`],
      [],
      ["Metric", "Value", "Previous period", "Change %"],
      ["Revenue", k.revenue.value, k.revenue.prev, k.revenue.change ?? ""],
      ["Jobs completed", k.jobs.value, k.jobs.prev, k.jobs.change ?? ""],
      ["  Daily jobs", k.jobs.daily],
      ["  Booked jobs", k.jobs.booking],
      ["Average job", k.avgJob.value],
      ["New customers", k.newCustomers.value, k.newCustomers.prev, k.newCustomers.change ?? ""],
      ["Profit", k.profit.value],
      ["Repeat customer rate %", k.repeatRate],
      [],
      ["Revenue by period", "Amount"],
      ...chart.map((r) => [r.label, r.revenue]),
      [],
      ["Top services", "Jobs", "Income"],
      ...data.topServices.map((s) => [s.name, s.count, s.revenue]),
      [],
      ["Technician", "Jobs completed", "Avg minutes"],
      ...data.technicians.map((t) => [t.name, t.jobs, t.avgMinutes ?? ""]),
    ];
    const csv = lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `report-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const k = data?.kpis;
  const profitKnown = !!k && k.profit.materialCost + k.profit.laborCost > 0;

  return (
    <div>
      {/* Red hero */}
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 via-red-600 to-red-800 px-6 py-6 text-white shadow-lg shadow-red-950/40">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 animate-blob" aria-hidden />
        <div className="pointer-events-none absolute -bottom-28 left-1/4 h-60 w-60 rounded-full bg-black/10 animate-blob" style={{ animationDelay: "-5s" }} aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Reports &amp; Analytics</p>
            <h1 className="mt-1 text-3xl font-bold">How the station is doing</h1>
            <div className="mt-2 flex items-center gap-2 text-xs text-white/85">
              <span className="relative flex h-2.5 w-2.5">
                {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? "bg-white" : "bg-white/40"}`} />
              </span>
              {live ? "Live — refreshes every minute" : "Auto-refresh paused"}
              {updatedAt && <span className="text-white/60">· updated {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
              <button onClick={() => setLive((v) => !v)} className="no-print ml-1 underline decoration-white/40 hover:decoration-white">
                {live ? "pause" : "resume"}
              </button>
            </div>
          </div>
          <div className="no-print flex gap-2">
            <button onClick={exportCsv} className="rounded-full bg-white/15 px-4 py-2 text-xs font-semibold ring-1 ring-white/30 hover:bg-white/25">
              ⭳ Export CSV
            </button>
            <button onClick={() => window.print()} className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:-translate-y-0.5 transition">
              Print / PDF
            </button>
          </div>
        </div>
        <div className="no-print relative mt-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              role="tab"
              aria-selected={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                period === p.key ? "bg-white text-red-700 shadow" : "bg-black/20 text-white/85 hover:bg-black/30"
              }`}
            >
              {p.label}
            </button>
          ))}
          {loading && <span className="ml-2 self-center text-xs text-white/70">loading…</span>}
        </div>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300 ring-1 ring-red-900">{error}</div>}

      {data && k && (
        <div key={period}>
          {/* KPIs */}
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi i={0} label="Revenue" value={money(k.revenue.value)} change={k.revenue.change} sub={`vs ${range.prevLabel}`} />
            <Kpi i={1} label="Jobs completed" value={String(k.jobs.value)} change={k.jobs.change} sub={`${k.jobs.daily} daily · ${k.jobs.booking} booked`} />
            <Kpi i={2} label="Average job" value={money(k.avgJob.value)} />
            <Kpi i={3} label="New customers" value={String(k.newCustomers.value)} change={k.newCustomers.change} />
            <Kpi i={4} label="Profit" value={profitKnown ? money(k.profit.value) : "—"} sub={profitKnown ? "after materials & labour" : "costs not recorded yet"} />
            <Kpi i={5} label="Repeat customers" value={`${k.repeatRate}%`} sub="all time" />
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            {/* Insights */}
            <Card title="What the numbers say" className="lg:col-span-1">
              <ul className="space-y-2">
                {data.insights.map((ins, idx) => (
                  <li
                    key={idx}
                    className="flex gap-2.5 rounded-lg bg-black/50 px-3 py-2 text-sm text-neutral-200 animate-row-in"
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        ins.tone === "good" ? "bg-green-900 text-green-300" : ins.tone === "bad" ? "bg-red-900 text-red-200" : "bg-neutral-800 text-neutral-300"
                      }`}
                      aria-label={ins.tone === "good" ? "good" : ins.tone === "bad" ? "needs attention" : "info"}
                    >
                      {ins.tone === "good" ? "✓" : ins.tone === "bad" ? "!" : "i"}
                    </span>
                    {ins.text}
                  </li>
                ))}
              </ul>
            </Card>

            {/* Revenue chart */}
            <Card title="Revenue received" className="lg:col-span-2" right={<span className="text-xs text-neutral-500">verified payments</span>}>
              {chart.every((r) => r.revenue === 0) ? (
                <div className="py-16 text-center text-sm text-neutral-500">No payments in this period yet.</div>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false} minTickGap={8} />
                      <YAxis
                        tick={{ fill: AXIS, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={72}
                        tickFormatter={(v: number) => (v >= 1000 ? `Rs. ${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `Rs. ${v}`)}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(229,72,77,0.08)" }}
                        contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#3f1d1d", backgroundColor: "#0a0a0a", color: "#f5f5f5" }}
                        itemStyle={{ color: "#f5f5f5" }}
                        labelStyle={{ color: AXIS }}
                        formatter={(v) => [money(Number(v)), "Revenue"]}
                      />
                      <Bar dataKey="revenue" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={40} animationDuration={700} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card title="Top services">
              <HBars rows={data.topServices.map((s) => ({ label: s.name, value: s.revenue, note: `×${s.count}` }))} format={money} empty="No completed jobs yet." />
            </Card>
            <Card title="Money received by method">
              <HBars
                rows={Object.entries(data.byMethod).map(([m, v]) => ({ label: METHOD_LABEL[m] ?? m, value: v }))}
                format={money}
                empty="No payments yet."
              />
            </Card>
            <Card title="Right now">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Waiting", data.alerts.waiting],
                  ["Working", data.alerts.inProgress],
                  ["Ready", data.alerts.ready],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-black/60 py-3 ring-1 ring-neutral-800">
                    <div className="text-2xl font-bold text-white animate-count-pop">{v}</div>
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500">{l}</div>
                  </div>
                ))}
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                <Alert show={data.alerts.outstandingCount > 0}>
                  {money(data.alerts.outstanding)} unpaid ({data.alerts.outstandingCount} invoices)
                </Alert>
                <Alert show={data.alerts.pendingTransfers > 0}>{data.alerts.pendingTransfers} bank transfer(s) to verify</Alert>
                <Alert show={data.alerts.lowStock.length > 0}>{data.alerts.lowStock.length} stock item(s) to reorder</Alert>
                {data.alerts.outstandingCount + data.alerts.pendingTransfers + data.alerts.lowStock.length === 0 && (
                  <li className="text-green-400">✓ Nothing needs attention.</li>
                )}
              </ul>
            </Card>
            <Card title="Technicians">
              {data.technicians.length === 0 ? (
                <div className="py-6 text-center text-sm text-neutral-500">No completed jobs in this period.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-red-500">
                    <tr>
                      <th className="pb-2">Technician</th>
                      <th className="pb-2 text-right">Jobs</th>
                      <th className="pb-2 text-right">Avg time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.technicians.map((t, i) => (
                      <tr key={t.name} className="border-t border-neutral-800 animate-row-in" style={{ animationDelay: `${i * 50}ms` }}>
                        <td className="py-1.5 text-white">{t.name}</td>
                        <td className="py-1.5 text-right text-neutral-300">{t.jobs}</td>
                        <td className="py-1.5 text-right text-neutral-400">{t.avgMinutes !== null ? `${t.avgMinutes} min` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card title="Bay use (booked hours)">
              <HBars
                rows={data.bays.map((b) => ({ label: b.name, value: b.utilizationRate }))}
                format={(v) => `${v}%`}
                max={100}
                empty="No bays set up."
              />
            </Card>
            <DailyReportCard />
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, right, className = "", children }: { title: string; right?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-2xl bg-neutral-950 p-5 ring-1 ring-red-900/30 animate-pop-in ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-red-500">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Kpi({ i, label, value, change, sub }: { i: number; label: string; value: string; change?: number | null; sub?: string }) {
  return (
    <div
      className="group rounded-2xl bg-neutral-950 p-4 ring-1 ring-red-900/30 transition hover:-translate-y-0.5 hover:ring-red-600/60 animate-pop-in"
      style={{ animationDelay: `${i * 60}ms` }}
    >
      <div className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px]">
        {change !== undefined && change !== null && (
          <span className={change >= 0 ? "text-green-400" : "text-red-400"}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%
          </span>
        )}
        {sub && <span className="text-neutral-500">{sub}</span>}
      </div>
      <div className="mt-3 h-0.5 w-8 rounded-full bg-red-600 transition-all duration-500 group-hover:w-full" aria-hidden />
    </div>
  );
}

function HBars({
  rows,
  format,
  max,
  empty,
}: {
  rows: { label: string; value: number; note?: string }[];
  format: (v: number) => string;
  max?: number;
  empty: string;
}) {
  if (rows.length === 0) return <div className="py-6 text-center text-sm text-neutral-500">{empty}</div>;
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between gap-2 text-xs">
            <span className="truncate text-neutral-300">
              {r.label}
              {r.note && <span className="ml-1 text-neutral-500">{r.note}</span>}
            </span>
            <span className="font-semibold text-white">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-800">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-red-700 to-red-500 transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max(2, (r.value / top) * 100)}%`, transitionDelay: `${i * 60}ms` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Alert({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return (
    <li className="flex items-center gap-2 text-red-300">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-900 text-[10px] font-bold text-red-100" aria-hidden>
        !
      </span>
      {children}
    </li>
  );
}

/** Owner gets today's summary on WhatsApp at a chosen hour, automatically. */
function DailyReportCard() {
  const [s, setS] = useState<DailyReportSettings | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    reportsApi.getDailyReportSettings().then(setS).catch((err) => setMsg({ ok: false, text: apiErrorMessage(err) }));
  }, []);

  async function save(next: DailyReportSettings) {
    setBusy(true);
    setMsg(null);
    try {
      setS(await reportsApi.saveDailyReportSettings({ enabled: next.enabled, whatsappNumber: next.whatsappNumber, hour: next.hour }));
      setMsg({ ok: true, text: next.enabled ? `Saved — the report goes out every day at ${String(next.hour).padStart(2, "0")}:00.` : "Saved — daily report is off." });
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    if (!confirm(`Send today's report to ${s?.whatsappNumber} on WhatsApp now?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await reportsApi.sendDailyReportNow();
      setPreview(r.text);
      setMsg({ ok: true, text: r.live ? `Sent to ${r.sentTo}.` : `WhatsApp isn't connected — the report was only logged on the server.` });
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Automatic daily report">
      {!s ? (
        <div className="text-sm text-neutral-500">Loading…</div>
      ) : (
        <div className="space-y-3 text-sm">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-neutral-200">Send today's summary to WhatsApp every day</span>
            <button
              type="button"
              role="switch"
              aria-checked={s.enabled}
              onClick={() => setS({ ...s, enabled: !s.enabled })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${s.enabled ? "bg-red-600" : "bg-neutral-700"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${s.enabled ? "left-5" : "left-0.5"}`} />
            </button>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <input
              value={s.whatsappNumber}
              onChange={(e) => setS({ ...s, whatsappNumber: e.target.value })}
              placeholder="Owner's WhatsApp 07X…"
              aria-label="WhatsApp number"
              className="col-span-2 rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white focus:border-red-600 focus:outline-none"
            />
            <select
              value={s.hour}
              onChange={(e) => setS({ ...s, hour: Number(e.target.value) })}
              aria-label="Send at"
              className="rounded-md border border-neutral-700 bg-black px-2 py-2 text-sm text-white"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => save(s)} disabled={busy} className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              Save
            </button>
            <button
              onClick={() => reportsApi.previewDailyReport().then(setPreview).catch((err) => setMsg({ ok: false, text: apiErrorMessage(err) }))}
              className="rounded-full px-4 py-1.5 text-xs font-medium text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-900"
            >
              Preview
            </button>
            <button
              onClick={sendNow}
              disabled={busy || !s.whatsappNumber}
              className="rounded-full px-4 py-1.5 text-xs font-medium text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-900 disabled:opacity-40"
            >
              Send now
            </button>
          </div>
          {s.lastSentDate && <div className="text-xs text-neutral-500">Last sent: {s.lastSentDate}</div>}
          {msg && <div className={`text-xs ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</div>}
          {preview && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg rounded-tl-none bg-[#0b3d2e] px-3 py-2 font-sans text-xs leading-relaxed text-green-50 animate-pop-in">
              {preview.replace(/\*/g, "")}
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}
