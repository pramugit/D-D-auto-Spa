import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as reportsApi from "../api/reports";
import type { IncomeData, IncomeJob } from "../api/reports";
import { apiErrorMessage } from "../api/client";

// Two-series categorical palette (validated on the #171717 dark surface:
// CVD ΔE 26.8, normal-vision ΔE 31.8, both ≥ 3:1). Colour follows the
// entity — Daily Jobs is always blue, Bookings always orange.
const DAILY_COLOR = "#3987e5";
const BOOKING_COLOR = "#d95926";
const SURFACE = "#171717";
const GRID = "#2a2a2a";
const AXIS = "#9a9a9a";

type PeriodKey = "today" | "month" | "3m" | "6m" | "12m";
type Bucket = "hour" | "day" | "week" | "month";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "month", label: "This month" },
  { key: "3m", label: "3 months" },
  { key: "6m", label: "6 months" },
  { key: "12m", label: "12 months" },
];

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  QR: "QR",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
};

/** Calendar-aligned windows in the shop's local time; `to` is exclusive. */
function periodRange(key: PeriodKey): { from: Date; to: Date; bucket: Bucket; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const tomorrow = new Date(y, m, d + 1);
  const fmt = (dt: Date) => dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  switch (key) {
    case "today":
      return { from: new Date(y, m, d), to: tomorrow, bucket: "hour", label: fmt(new Date(y, m, d)) };
    case "month":
      return { from: new Date(y, m, 1), to: tomorrow, bucket: "day", label: `since ${fmt(new Date(y, m, 1))}` };
    case "3m":
      return { from: new Date(y, m - 2, 1), to: tomorrow, bucket: "week", label: `since ${fmt(new Date(y, m - 2, 1))}` };
    case "6m":
      return { from: new Date(y, m - 5, 1), to: tomorrow, bucket: "month", label: `since ${fmt(new Date(y, m - 5, 1))}` };
    case "12m":
      return { from: new Date(y, m - 11, 1), to: tomorrow, bucket: "month", label: `since ${fmt(new Date(y, m - 11, 1))}` };
  }
}

function bucketStart(dt: Date, bucket: Bucket): Date {
  switch (bucket) {
    case "hour":
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours());
    case "day":
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    case "week": {
      const day = (dt.getDay() + 6) % 7; // Monday = 0
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - day);
    }
    case "month":
      return new Date(dt.getFullYear(), dt.getMonth(), 1);
  }
}

function nextBucket(dt: Date, bucket: Bucket): Date {
  const n = new Date(dt);
  if (bucket === "hour") n.setHours(n.getHours() + 1);
  else if (bucket === "day") n.setDate(n.getDate() + 1);
  else if (bucket === "week") n.setDate(n.getDate() + 7);
  else n.setMonth(n.getMonth() + 1);
  return n;
}

function bucketLabel(dt: Date, bucket: Bucket): string {
  if (bucket === "hour") return `${String(dt.getHours()).padStart(2, "0")}:00`;
  if (bucket === "day") return dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (bucket === "week") return `Wk ${dt.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  return dt.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

const money = (n: number) =>
  `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function sum(jobs: IncomeJob[], pick: (j: IncomeJob) => number) {
  return jobs.reduce((s, j) => s + pick(j), 0);
}

/**
 * Income dashboard at the top of Invoices & Payments: income from
 * completed Daily Jobs (walk-ins) and completed Bookings, side by side,
 * for today / this month / 3, 6 and 12 months — plus collections by
 * payment method, outstanding balances, discounts/tax, and top earners.
 */
export function IncomeDashboard() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [data, setData] = useState<IncomeData | null>(null);
  const [prev, setPrev] = useState<IncomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const range = useMemo(() => periodRange(period), [period]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Previous period = same length, immediately before — for the % change.
    const len = range.to.getTime() - range.from.getTime();
    const prevFrom = new Date(range.from.getTime() - len);
    Promise.all([reportsApi.getIncome(range.from, range.to), reportsApi.getIncome(prevFrom, range.from)])
      .then(([cur, before]) => {
        if (cancelled) return;
        setData(cur);
        setPrev(before);
      })
      .catch((err) => !cancelled && setError(apiErrorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const stats = useMemo(() => {
    if (!data) return null;
    const daily = data.jobs.filter((j) => j.isWalkIn);
    const booking = data.jobs.filter((j) => !j.isWalkIn);
    const dailyIncome = sum(daily, (j) => j.total);
    const bookingIncome = sum(booking, (j) => j.total);
    const total = dailyIncome + bookingIncome;
    const prevTotal = prev ? sum(prev.jobs, (j) => j.total) : 0;

    // Time series, every bucket present (zeros included) so gaps read as gaps.
    const series: { label: string; daily: number; booking: number }[] = [];
    const index = new Map<number, number>();
    for (let b = bucketStart(range.from, range.bucket); b < range.to; b = nextBucket(b, range.bucket)) {
      index.set(b.getTime(), series.length);
      series.push({ label: bucketLabel(b, range.bucket), daily: 0, booking: 0 });
    }
    for (const j of data.jobs) {
      const i = index.get(bucketStart(new Date(j.completedAt), range.bucket).getTime());
      if (i === undefined) continue;
      if (j.isWalkIn) series[i].daily += j.total;
      else series[i].booking += j.total;
    }
    // "Today" — trim the empty night hours at both ends (keep 08:00–18:00).
    let chart = series;
    if (range.bucket === "hour") {
      const first = Math.min(8, ...series.flatMap((p, i) => (p.daily || p.booking ? [i] : [])));
      const last = Math.max(18, ...series.flatMap((p, i) => (p.daily || p.booking ? [i] : [])));
      chart = series.slice(first, last + 1);
    }

    const byMethod = new Map<string, number>();
    for (const p of data.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);
    const methods = ["CASH", "QR", "BANK_TRANSFER", "CARD"]
      .map((m) => ({ method: m, amount: byMethod.get(m) ?? 0 }))
      .filter((m) => m.amount > 0 || m.method !== "CARD");
    const collected = data.payments.reduce((s, p) => s + p.amount, 0);

    const earners = new Map<string, { name: string; isPackage: boolean; jobs: number; income: number }>();
    for (const j of data.jobs)
      for (const it of j.items) {
        const e = earners.get(it.name) ?? { name: it.name, isPackage: it.isPackage, jobs: 0, income: 0 };
        e.jobs += 1;
        e.income += it.price;
        earners.set(it.name, e);
      }
    const top = [...earners.values()].sort((a, b) => b.income - a.income).slice(0, 8);

    return {
      daily: { income: dailyIncome, count: daily.length, avg: daily.length ? dailyIncome / daily.length : 0 },
      booking: { income: bookingIncome, count: booking.length, avg: booking.length ? bookingIncome / booking.length : 0 },
      total,
      change: prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null,
      prevTotal,
      tax: sum(data.jobs, (j) => j.tax),
      discount: sum(data.jobs, (j) => j.discount),
      chart,
      methods,
      collected,
      top,
    };
  }, [data, prev, range]);

  const maxMethod = stats ? Math.max(1, ...stats.methods.map((m) => m.amount)) : 1;

  return (
    <section className="mb-8 rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
      {/* Header + period filter (one row) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Income dashboard</h2>
          <p className="text-xs text-neutral-500">
            Completed jobs · {range.label}
            {loading && " · loading..."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-md bg-black p-1" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              role="tab"
              aria-selected={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                period === p.key ? "bg-red-600 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-500">{error}</div>}

      {stats && (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Total income" value={money(stats.total)}>
              {stats.change === null ? (
                <span className="text-neutral-500">no income in the previous period</span>
              ) : (
                <span className={stats.change >= 0 ? "text-green-400" : "text-red-400"}>
                  {stats.change >= 0 ? "▲" : "▼"} {Math.abs(stats.change).toFixed(0)}% vs previous period (
                  {money(stats.prevTotal)})
                </span>
              )}
            </Tile>
            <Tile label="Daily jobs income" swatch={DAILY_COLOR} value={money(stats.daily.income)}>
              {stats.daily.count} completed · avg {money(Math.round(stats.daily.avg))}
              {stats.total > 0 && <> · {Math.round((stats.daily.income / stats.total) * 100)}%</>}
            </Tile>
            <Tile label="Booking jobs income" swatch={BOOKING_COLOR} value={money(stats.booking.income)}>
              {stats.booking.count} completed · avg {money(Math.round(stats.booking.avg))}
              {stats.total > 0 && <> · {Math.round((stats.booking.income / stats.total) * 100)}%</>}
            </Tile>
            <Tile label="Jobs completed" value={String(stats.daily.count + stats.booking.count)}>
              {stats.daily.count} daily · {stats.booking.count} booking
            </Tile>
          </div>

          {/* Income over time */}
          <div className="mt-5 rounded-md border border-neutral-800 bg-black/40 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-neutral-200">Income over time</h3>
              <div className="flex items-center gap-4 text-xs text-neutral-300">
                <Legend color={DAILY_COLOR} label="Daily jobs" />
                <Legend color={BOOKING_COLOR} label="Bookings" />
                <button onClick={() => setShowTable((s) => !s)} className="text-neutral-500 underline hover:text-neutral-300">
                  {showTable ? "Show chart" : "Show table"}
                </button>
              </div>
            </div>
            {showTable ? (
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-neutral-500">
                    <tr>
                      <th className="py-1">Period</th>
                      <th className="py-1 text-right">Daily jobs</th>
                      <th className="py-1 text-right">Bookings</th>
                      <th className="py-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.chart.map((r) => (
                      <tr key={r.label} className="border-t border-neutral-800 text-neutral-300">
                        <td className="py-1">{r.label}</td>
                        <td className="py-1 text-right">{money(r.daily)}</td>
                        <td className="py-1 text-right">{money(r.booking)}</td>
                        <td className="py-1 text-right text-white">{money(r.daily + r.booking)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                      cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID, backgroundColor: "#141414", color: "#f5f5f5" }}
                      // Text stays in ink colours; the legend swatches carry series identity.
                      itemStyle={{ color: "#f5f5f5" }}
                      labelStyle={{ color: "#9a9a9a" }}
                      itemSorter={(item) => (item.dataKey === "daily" ? 0 : 1)}
                      formatter={(v, name) => [money(Number(v)), name === "daily" ? "Daily jobs" : "Bookings"]}
                    />
                    {/* Stacked: bottom segment flat, top segment carries the rounded end;
                        the surface-coloured stroke gives the 2px gap between segments. */}
                    <Bar dataKey="daily" stackId="i" fill={DAILY_COLOR} stroke={SURFACE} strokeWidth={1} maxBarSize={36} />
                    <Bar dataKey="booking" stackId="i" fill={BOOKING_COLOR} stroke={SURFACE} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Collections by method */}
            <div className="rounded-md border border-neutral-800 bg-black/40 p-3">
              <h3 className="text-sm font-semibold text-neutral-200">Money received by method</h3>
              <p className="mb-3 text-xs text-neutral-500">Verified payments in this period · {money(stats.collected)}</p>
              <div className="space-y-2.5">
                {stats.methods.map((m) => (
                  <div key={m.method}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-neutral-300">{METHOD_LABELS[m.method] ?? m.method}</span>
                      <span className="text-white">{money(m.amount)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-neutral-800">
                      <div className="h-2 rounded-full bg-neutral-300" style={{ width: `${(m.amount / maxMethod) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Money still to come + deductions */}
            <div className="rounded-md border border-neutral-800 bg-black/40 p-3">
              <h3 className="mb-3 text-sm font-semibold text-neutral-200">Balances & deductions</h3>
              <dl className="space-y-2 text-sm">
                <Row
                  label="Outstanding (unpaid invoices, all time)"
                  value={money(data!.outstanding.walkIn + data!.outstanding.booking)}
                  hint={`${data!.outstanding.invoices} invoice(s) · daily ${money(data!.outstanding.walkIn)} · booking ${money(data!.outstanding.booking)}`}
                />
                <Row
                  label="Bank transfers awaiting verification"
                  value={money(data!.pendingVerification.amount)}
                  hint={`${data!.pendingVerification.count} payment(s)`}
                />
                <Row label="Tax collected (this period)" value={money(stats.tax)} />
                <Row label="Discounts given (this period)" value={money(stats.discount)} />
              </dl>
            </div>

            {/* Top earners */}
            <div className="rounded-md border border-neutral-800 bg-black/40 p-3">
              <h3 className="mb-3 text-sm font-semibold text-neutral-200">Top services & packages</h3>
              {stats.top.length === 0 ? (
                <p className="text-xs text-neutral-500">No completed jobs in this period.</p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {stats.top.map((t) => (
                      <tr key={t.name} className="border-t border-neutral-800 first:border-0">
                        <td className="py-1.5 text-neutral-300">
                          {t.name}
                          {t.isPackage && <span className="ml-1 rounded bg-neutral-800 px-1 text-[10px] text-neutral-400">pkg</span>}
                        </td>
                        <td className="py-1.5 text-right text-neutral-500">×{t.jobs}</td>
                        <td className="py-1.5 text-right text-white">{money(t.income)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Tile({ label, value, swatch, children }: { label: string; value: string; swatch?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-black/40 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-400">
        {swatch && <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: swatch }} aria-hidden />}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
      {children && <div className="mt-1 text-xs text-neutral-400">{children}</div>}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
      {label}
    </span>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="flex justify-between gap-2">
        <dt className="text-neutral-400">{label}</dt>
        <dd className="font-medium text-white">{value}</dd>
      </div>
      {hint && <div className="text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}
