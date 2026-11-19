import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import * as bookingsApi from "../api/bookings";
import * as reportsApi from "../api/reports";
import type { ProfitReport } from "../api/reports";
import type { AttentionBooking, Booking } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";

const ACTIVE_STATUSES = new Set(["PENDING", "CONFIRMED", "IN_PROGRESS", "QUALITY_CHECK", "READY"]);

type Kind = "daily" | "booking";
const KIND: Record<Kind, { label: string; hint: string; badge: string }> = {
  daily: { label: "Daily jobs", hint: "walk-ins", badge: "bg-red-600 text-white" },
  booking: { label: "Booking jobs", hint: "scheduled", badge: "bg-neutral-200 text-neutral-900" },
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 97769 → "67d 21h", 264 → "4h 24m", 35 → "35m". */
function waited(min: number) {
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

const money = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Manager Operations Dashboard — everything shown separately for Daily Jobs
 * (walk-ins) and Booking jobs (scheduled appointments): profit per period,
 * what's in progress, what needs attention, who's handling what, and low
 * ratings to follow up.
 */
export function OpsDashboardPage() {
  const [attention, setAttention] = useState<AttentionBooking[]>([]);
  const [activeBookings, setActiveBookings] = useState<Booking[]>([]);
  const [profit, setProfit] = useState<{ label: string; data: ProfitReport }[]>([]);
  const [satisfactionAlerts, setSatisfactionAlerts] = useState<reportsApi.SatisfactionAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setError(null);
    try {
      const now = new Date();
      const startOfToday = isoDate(now);
      const startOfWeek = isoDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      const startOfMonth = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
      const endOfRange = isoDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));

      const [attentionList, bookings, pToday, pWeek, pMonth, alerts] = await Promise.all([
        bookingsApi.getBookingsNeedingAttention(),
        bookingsApi.listBookings(),
        reportsApi.getProfitReport(startOfToday, endOfRange),
        reportsApi.getProfitReport(startOfWeek, endOfRange),
        reportsApi.getProfitReport(startOfMonth, endOfRange),
        reportsApi.getSatisfactionAlerts(),
      ]);

      setAttention(attentionList);
      setActiveBookings(bookings.filter((b) => ACTIVE_STATUSES.has(b.status)));
      setProfit([
        { label: "Today", data: pToday },
        { label: "This week", data: pWeek },
        { label: "This month", data: pMonth },
      ]);
      setSatisfactionAlerts(alerts);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="text-neutral-500">Loading...</div>;

  const kindOf = (isWalkIn: boolean | undefined): Kind => (isWalkIn ? "daily" : "booking");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Manager Operations Dashboard</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
          Daily jobs and booking jobs are shown separately:
          <KindBadge kind="daily" /> <KindBadge kind="booking" />
        </p>
      </div>
      {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}

      {/* Profit per period, split */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {profit.map((p, i) => (
          <ProfitTile key={p.label} i={i} label={p.label} data={p.data} />
        ))}
      </div>

      {/* Live work, one column per kind */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {(["daily", "booking"] as Kind[]).map((kind) => (
          <KindColumn
            key={kind}
            kind={kind}
            active={activeBookings.filter((b) => kindOf(b.isWalkIn) === kind)}
            attention={attention.filter((a) => kindOf(a.isWalkIn) === kind)}
          />
        ))}
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">
          Satisfaction Alerts <span className="text-neutral-500">({satisfactionAlerts.length})</span>
          {satisfactionAlerts.length > 0 && (
            <span className="ml-2 normal-case text-neutral-500">
              · {satisfactionAlerts.filter((a) => a.isWalkIn).length} daily · {satisfactionAlerts.filter((a) => !a.isWalkIn).length} booking
            </span>
          )}
        </h2>
        {satisfactionAlerts.length === 0 ? (
          <div className="text-sm text-neutral-500">No low ratings to follow up on.</div>
        ) : (
          <div className="space-y-2">
            {satisfactionAlerts.map((a) => (
              <Link key={a.reviewId} to={`/job-board/${a.jobCardId}`} className="block rounded-md border border-neutral-800 p-3 hover:bg-black">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <KindBadge kind={kindOf(a.isWalkIn)} />
                    {a.customer.name} — {a.vehicle.plateNumber} ({a.vehicle.make} {a.vehicle.model})
                  </div>
                  <div className="text-red-300">
                    {"★".repeat(a.rating)}
                    {"☆".repeat(5 - a.rating)}
                  </div>
                </div>
                {a.comment && <div className="mt-1 text-xs text-neutral-400">"{a.comment}"</div>}
                <div className="mt-1 text-xs text-neutral-500">{new Date(a.createdAt).toLocaleString()}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: Kind }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND[kind].badge}`}>
      {KIND[kind].label}
    </span>
  );
}

const STAGES: { status: string; label: string }[] = [
  { status: "PENDING", label: "Requested" },
  { status: "CONFIRMED", label: "Waiting" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "QUALITY_CHECK", label: "QC" },
  { status: "READY", label: "Ready" },
];

function KindColumn({ kind, active, attention }: { kind: Kind; active: Booking[]; attention: AttentionBooking[] }) {
  const slaBreaches = attention.filter((b) => b.slaBreached);
  const unassigned = attention.filter((b) => b.unassigned && !b.slaBreached);
  // Walk-ins never sit in "Requested" — they're confirmed on arrival.
  const stages = kind === "daily" ? STAGES.filter((s) => s.status !== "PENDING") : STAGES;

  const ownerGroups = new Map<string, { label: string; bookings: Booking[] }>();
  for (const b of active) {
    const key = b.currentOwnerUserId ?? "unclaimed";
    const label = b.currentOwner ? `${b.currentOwner.name} (${b.currentOwner.role})` : "Unclaimed";
    const group = ownerGroups.get(key) ?? { label, bookings: [] };
    group.bookings.push(b);
    ownerGroups.set(key, group);
  }
  const groups = [...ownerGroups.values()].sort((a, b) => b.bookings.length - a.bookings.length);

  return (
    <section
      className={`rounded-xl border bg-neutral-900 p-5 ${kind === "daily" ? "border-red-900/60" : "border-neutral-700"}`}
      aria-label={KIND[kind].label}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <KindBadge kind={kind} />
          <span className="text-sm font-normal text-neutral-500">{KIND[kind].hint}</span>
        </h2>
        <Link to={kind === "daily" ? "/daily-jobs" : "/job-board"} className="text-xs text-red-400 hover:underline">
          Open {kind === "daily" ? "Daily Jobs" : "Booking Job Board"} →
        </Link>
      </div>

      {/* Pipeline counts */}
      <div className={`mb-4 grid gap-2 ${stages.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
        {stages.map((s) => (
          <div key={s.status} className="rounded-lg bg-black py-2 text-center ring-1 ring-neutral-800">
            <div className="text-xl font-bold text-white">{active.filter((b) => b.status === s.status).length}</div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">{s.label}</div>
          </div>
        ))}
      </div>

      <Sub title={`Needs attention (${attention.length})`}>
        <AttentionGroup title="SLA breached" items={slaBreaches} />
        <AttentionGroup title="Unassigned" items={unassigned} />
        {attention.length === 0 && <div className="text-sm text-neutral-500">Nothing needs attention right now.</div>}
      </Sub>

      <Sub title={`Who's handling what (${active.length} active)`}>
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="mb-1 flex items-center justify-between text-sm font-medium text-neutral-200">
                <span>{group.label}</span>
                <span className="text-xs text-neutral-500">{group.bookings.length}</span>
              </div>
              <div className="space-y-1">
                {group.bookings.map((b) => (
                  <Link
                    key={b.id}
                    to={b.jobCard ? `/job-board/${b.jobCard.id}` : "/bookings"}
                    className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-black"
                  >
                    <span className="text-neutral-300">
                      {b.vehicle?.plateNumber} — {b.customer?.name}
                    </span>
                    <StatusBadge status={b.status} />
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && <div className="text-sm text-neutral-500">No active {KIND[kind].label.toLowerCase()}.</div>}
        </div>
      </Sub>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4 border-t border-neutral-800 pt-3 first:mt-0">
      <h3 className="mb-2 text-xs font-semibold uppercase text-neutral-400">{title}</h3>
      {children}
    </div>
  );
}

function AttentionGroup({ title, items }: { title: string; items: AttentionBooking[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">
        {title} ({items.length})
      </div>
      <div className="space-y-1">
        {items.map((b) => (
          <Link
            key={b.id}
            to={b.jobCardId ? `/job-board/${b.jobCardId}` : "/bookings"}
            className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-red-950"
          >
            <span className="text-neutral-200">
              {b.vehicle.plateNumber} — {b.customer.name}
            </span>
            <span className="text-neutral-500">
              <StatusBadge status={b.status} /> {waited(b.minutesInStatus)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ProfitTile({ i, label, data }: { i: number; label: string; data: ProfitReport }) {
  const total = data.overTime;
  const rows: { kind: Kind; t: reportsApi.ProfitTotals }[] = [
    { kind: "daily", t: data.split.daily },
    { kind: "booking", t: data.split.booking },
  ];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.t.profit)));
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 animate-pop-in" style={{ animationDelay: `${i * 70}ms` }}>
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase text-neutral-500">{label} · profit</div>
        <div className="text-[11px] text-neutral-500">
          {total.jobCardCount} job{total.jobCardCount === 1 ? "" : "s"} invoiced
        </div>
      </div>
      <div
        className={`mt-1 text-2xl font-semibold ${total.profit < 0 ? "text-red-600" : "text-white"}`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {money(total.profit)}
      </div>
      <div className="mt-3 space-y-2">
        {rows.map(({ kind, t }) => (
          <div key={kind}>
            <div className="mb-0.5 flex items-center justify-between text-xs">
              <span className="text-neutral-300">
                {KIND[kind].label} <span className="text-neutral-500">· {t.jobCardCount}</span>
              </span>
              <span className={`font-semibold ${t.profit < 0 ? "text-red-500" : "text-white"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                {money(t.profit)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-neutral-800">
              <div
                className={`h-1.5 rounded-full ${kind === "daily" ? "bg-red-600" : "bg-neutral-300"}`}
                style={{ width: `${(Math.abs(t.profit) / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
