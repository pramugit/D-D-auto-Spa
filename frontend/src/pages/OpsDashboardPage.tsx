import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as bookingsApi from "../api/bookings";
import * as reportsApi from "../api/reports";
import type { AttentionBooking, Booking } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";

const ACTIVE_STATUSES = new Set(["PENDING", "CONFIRMED", "IN_PROGRESS", "QUALITY_CHECK", "READY"]);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function OpsDashboardPage() {
  const [attention, setAttention] = useState<AttentionBooking[]>([]);
  const [activeBookings, setActiveBookings] = useState<Booking[]>([]);
  const [profitToday, setProfitToday] = useState<reportsApi.ProfitReport["overTime"] | null>(null);
  const [profitWeek, setProfitWeek] = useState<reportsApi.ProfitReport["overTime"] | null>(null);
  const [profitMonth, setProfitMonth] = useState<reportsApi.ProfitReport["overTime"] | null>(null);
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
      setProfitToday(pToday.overTime);
      setProfitWeek(pWeek.overTime);
      setProfitMonth(pMonth.overTime);
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

  if (loading) return <div className="text-slate-400">Loading...</div>;

  const slaBreaches = attention.filter((b) => b.slaBreached);
  const unassigned = attention.filter((b) => b.unassigned && !b.slaBreached);

  const ownerGroups = new Map<string, { label: string; bookings: Booking[] }>();
  for (const b of activeBookings) {
    const key = b.currentOwnerUserId ?? "unclaimed";
    const label = b.currentOwner ? `${b.currentOwner.name} (${b.currentOwner.role})` : "Unclaimed";
    const group = ownerGroups.get(key) ?? { label, bookings: [] };
    group.bookings.push(b);
    ownerGroups.set(key, group);
  }
  const ownerGroupList = Array.from(ownerGroups.values()).sort((a, b) => b.bookings.length - a.bookings.length);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-800">Manager Operations Dashboard</h1>
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mb-6 grid grid-cols-3 gap-4">
        <ProfitTile label="Today" data={profitToday} />
        <ProfitTile label="This Week" data={profitWeek} />
        <ProfitTile label="This Month" data={profitMonth} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">
            Needs Attention <span className="text-slate-400">({attention.length})</span>
          </h2>
          <AttentionGroup title="SLA Breached" items={slaBreaches} />
          <AttentionGroup title="Unassigned" items={unassigned} />
          {attention.length === 0 && <div className="text-sm text-slate-400">Nothing needs attention right now.</div>}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">
            Who's Handling What <span className="text-slate-400">({activeBookings.length} active)</span>
          </h2>
          <div className="space-y-3">
            {ownerGroupList.map((group) => (
              <div key={group.label}>
                <div className="mb-1 flex items-center justify-between text-sm font-medium text-slate-700">
                  <span>{group.label}</span>
                  <span className="text-xs text-slate-400">{group.bookings.length}</span>
                </div>
                <div className="space-y-1">
                  {group.bookings.map((b) => (
                    <Link
                      key={b.id}
                      to={b.jobCard ? `/job-cards/${b.jobCard.id}` : "/bookings"}
                      className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      <span className="text-slate-600">
                        {b.vehicle?.plateNumber} — {b.customer?.name}
                      </span>
                      <StatusBadge status={b.status} />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {ownerGroupList.length === 0 && <div className="text-sm text-slate-400">No active bookings.</div>}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">
          Satisfaction Alerts <span className="text-slate-400">({satisfactionAlerts.length})</span>
        </h2>
        {satisfactionAlerts.length === 0 ? (
          <div className="text-sm text-slate-400">No low ratings to follow up on.</div>
        ) : (
          <div className="space-y-2">
            {satisfactionAlerts.map((a) => (
              <Link
                key={a.reviewId}
                to={`/job-cards/${a.jobCardId}`}
                className="block rounded-md border border-slate-100 p-3 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-800">
                    {a.customer.name} — {a.vehicle.plateNumber} ({a.vehicle.make} {a.vehicle.model})
                  </div>
                  <div className="text-amber-500">{"★".repeat(a.rating)}{"☆".repeat(5 - a.rating)}</div>
                </div>
                {a.comment && <div className="mt-1 text-xs text-slate-500">"{a.comment}"</div>}
                <div className="mt-1 text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AttentionGroup({ title, items }: { title: string; items: AttentionBooking[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs font-semibold uppercase text-slate-400">
        {title} ({items.length})
      </div>
      <div className="space-y-1">
        {items.map((b) => (
          <Link
            key={b.id}
            to={b.jobCardId ? `/job-cards/${b.jobCardId}` : "/bookings"}
            className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-red-50"
          >
            <span className="text-slate-700">
              {b.vehicle.plateNumber} — {b.customer.name}
            </span>
            <span className="text-slate-400">
              <StatusBadge status={b.status} /> {b.minutesInStatus}min
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ProfitTile({ label, data }: { label: string; data: reportsApi.ProfitReport["overTime"] | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          data && data.profit < 0 ? "text-red-600" : "text-slate-800"
        }`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        ${data ? data.profit.toFixed(2) : "0.00"}
      </div>
      <div className="text-xs text-slate-400">
        {data?.jobCardCount ?? 0} job{data?.jobCardCount === 1 ? "" : "s"} invoiced
      </div>
    </div>
  );
}
