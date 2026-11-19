import { ProposeTimeModal } from "../components/ProposeTimeModal";
import { preferredText } from "../components/BookingRequestPanel";
import { packageMinutes } from "../utils/duration";
import { vehicleTypeLabel } from "../config/vehicleTypes";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import * as bookingsApi from "../api/bookings";
import * as customersApi from "../api/customers";
import * as catalogApi from "../api/catalog";
import type { Booking, BookingStatus, Customer, Service, ServicePackage, Vehicle } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { Modal } from "../components/Modal";
import { useAuth } from "../hooks/useAuth";
import { canEdit } from "../config/permissions";
import { formatMoney } from "../utils/money";
import { servicePrice } from "../components/DailyJobIntake";
import { SlotPicker } from "../components/SlotPicker";
import { DayView, RescheduleModal, ScheduleSettingsModal, WeekView, isoDay } from "../components/ScheduleViews";

// ── Helpers ──────────────────────────────────────────────────────────────
type Period = "upcoming" | "today" | "week" | "past" | "all";
type StatusGroup = "ALL" | "REQUESTS" | "CONFIRMED" | "WORKSHOP" | "READY" | "COMPLETED" | "CANCELLED";

const PERIODS: { key: Period; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
];

const GROUPS: { key: StatusGroup; label: string; statuses: BookingStatus[] }[] = [
  { key: "ALL", label: "All", statuses: [] },
  { key: "REQUESTS", label: "Requests", statuses: ["PENDING"] },
  { key: "CONFIRMED", label: "Confirmed", statuses: ["CONFIRMED"] },
  { key: "WORKSHOP", label: "In workshop", statuses: ["IN_PROGRESS", "QUALITY_CHECK"] },
  { key: "READY", label: "Ready", statuses: ["READY"] },
  { key: "COMPLETED", label: "Completed", statuses: ["COMPLETED"] },
  { key: "CANCELLED", label: "Cancelled", statuses: ["CANCELLED"] },
];

const STATUS_STYLE: Record<BookingStatus, { label: string; cls: string }> = {
  PENDING: { label: "Request", cls: "bg-yellow-950 text-yellow-300 ring-1 ring-yellow-800" },
  CONFIRMED: { label: "Confirmed", cls: "bg-neutral-200 text-neutral-900" },
  IN_PROGRESS: { label: "In progress", cls: "bg-red-600 text-white" },
  QUALITY_CHECK: { label: "Quality check", cls: "bg-red-950 text-red-300 ring-1 ring-red-800" },
  READY: { label: "Ready", cls: "bg-green-950 text-green-300 ring-1 ring-green-800" },
  COMPLETED: { label: "Completed", cls: "bg-neutral-800 text-neutral-400" },
  CANCELLED: { label: "Cancelled", cls: "bg-neutral-900 text-neutral-500 line-through" },
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const ACTIVE: BookingStatus[] = ["PENDING", "CONFIRMED", "IN_PROGRESS", "QUALITY_CHECK", "READY"];

function dayHeading(d: Date) {
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000);
  const date = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  if (diff === 0) return { title: "Today", sub: date };
  if (diff === 1) return { title: "Tomorrow", sub: date };
  if (diff === -1) return { title: "Yesterday", sub: date };
  return { title: d.toLocaleDateString(undefined, { weekday: "long" }), sub: d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) };
}

const bookingTotal = (b: Booking) => (b.services ?? []).reduce((s, x) => s + Number(x.price), 0);
const itemNames = (b: Booking) => (b.services ?? []).map((s) => s.package?.name ?? s.service?.name ?? "Service");

/**
 * Bookings — scheduled appointments, laid out clearly: what needs action
 * (new requests) first, then the day-by-day schedule with search, period and
 * status filters. Walk-ins live on Daily Jobs and are hidden here by default.
 */
export function BookingsPage() {
  const { user } = useAuth();
  const canManage = !!user && canEdit(user.role, "bookings");
  const [all, setAll] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [period, setPeriod] = useState<Period>("upcoming");
  const [group, setGroup] = useState<StatusGroup>("ALL");
  const [search, setSearch] = useState("");
  const [showWalkIns, setShowWalkIns] = useState(false);
  const [view, setView] = useState<"list" | "day" | "week">("list");
  const [day, setDay] = useState(isoDay(new Date()));
  const [weekStart, setWeekStart] = useState(isoDay(new Date()));
  const [refreshKey, setRefreshKey] = useState(0);
  const [moving, setMoving] = useState<Booking | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [proposing, setProposing] = useState<Booking | null>(null);
  const canSetRules = !!user && ["ADMIN", "MANAGER"].includes(user.role);

  const load = useCallback(async () => {
    try {
      setAll(await bookingsApi.listBookings());
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  async function transition(b: Booking, status: BookingStatus) {
    if (status === "CANCELLED" && !confirm(`Cancel ${b.customer?.name}'s booking for ${b.vehicle?.plateNumber}?`)) return;
    setBusyId(b.id);
    setError(null);
    try {
      await bookingsApi.updateBookingStatus(b.id, status);
      setNotice(
        status === "CONFIRMED"
          ? `Confirmed — ${b.customer?.name} gets a WhatsApp confirmation and the job card is ready on the Booking Job Board.`
          : `Booking for ${b.vehicle?.plateNumber} cancelled.`
      );
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  // Scheduled bookings (walk-ins optional)
  const bookings = useMemo(() => all.filter((b) => showWalkIns || !b.isWalkIn), [all, showWalkIns]);

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);
  const pending = bookings.filter((b) => b.status === "PENDING");
  // Customer requests needing a time, oldest first.
  const newRequests = pending.filter((b) => b.requestStage === "REQUESTED").sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  // Time sent, waiting for the customer to confirm.
  const awaitingCustomer = pending.filter((b) => b.requestStage === "TIME_PROPOSED").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  // Staff-made bookings still to confirm.
  const requests = pending.filter((b) => !b.requestStage).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const kpis = {
    requests: newRequests.length + requests.length,
    today: bookings.filter((b) => b.status !== "CANCELLED" && new Date(b.scheduledAt) >= today && new Date(b.scheduledAt) < tomorrow).length,
    week: bookings.filter((b) => ACTIVE.includes(b.status) && new Date(b.scheduledAt) >= today && new Date(b.scheduledAt) < weekEnd).length,
    workshop: bookings.filter((b) => ["IN_PROGRESS", "QUALITY_CHECK", "READY"].includes(b.status)).length,
  };

  const inPeriod = (b: Booking) => {
    const t = new Date(b.scheduledAt);
    switch (period) {
      case "upcoming":
        return t >= today || ACTIVE.includes(b.status); // still-open older bookings stay visible
      case "today":
        return t >= today && t < tomorrow;
      case "week":
        return t >= today && t < weekEnd;
      case "past":
        return t < today;
      default:
        return true;
    }
  };
  const q = search.trim().toLowerCase();
  const matches = (b: Booking) =>
    !q ||
    [b.customer?.name, b.customer?.phone, b.vehicle?.plateNumber, b.vehicle?.make, b.vehicle?.model, ...itemNames(b)].some((v) =>
      v?.toLowerCase().includes(q)
    );
  const base = bookings.filter((b) => inPeriod(b) && matches(b));
  const groupDef = GROUPS.find((g) => g.key === group)!;
  const shown = base
    .filter((b) => group === "ALL" || groupDef.statuses.includes(b.status))
    .sort((a, b) => (period === "past" ? b.scheduledAt.localeCompare(a.scheduledAt) : a.scheduledAt.localeCompare(b.scheduledAt)));

  // Group by day
  const days = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of shown) {
      const k = startOfDay(new Date(b.scheduledAt)).toISOString();
      m.set(k, [...(m.get(k) ?? []), b]);
    }
    return [...m.entries()];
  }, [shown]);

  return (
    <div>
      {/* Hero */}
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 via-red-600 to-red-800 px-6 py-6 text-white shadow-lg shadow-red-950/40">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 animate-blob" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Appointments</p>
            <h1 className="mt-1 text-3xl font-bold">Bookings</h1>
            <p className="mt-1 text-sm text-white/80">Scheduled customer appointments. Walk-ins are on Daily Jobs.</p>
          </div>
          {canManage && (
            <button
              onClick={() => setShowCreate(true)}
              className="group rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-red-700 shadow-md transition hover:-translate-y-0.5"
            >
              <span className="mr-1 inline-block transition-transform duration-300 group-hover:rotate-90">+</span> New Booking
            </button>
          )}
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "New requests", value: kpis.requests, onClick: () => { setGroup("REQUESTS"); setPeriod("all"); } },
            { label: "Today", value: kpis.today, onClick: () => { setPeriod("today"); setGroup("ALL"); } },
            { label: "Next 7 days", value: kpis.week, onClick: () => { setPeriod("week"); setGroup("ALL"); } },
            { label: "In the workshop", value: kpis.workshop, onClick: () => { setGroup("WORKSHOP"); setPeriod("all"); } },
          ].map((k, i) => (
            <button
              key={k.label}
              onClick={k.onClick}
              className="rounded-xl bg-white/15 px-4 py-2.5 text-left ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-white/25"
            >
              <div className="text-2xl font-bold animate-count-pop" style={{ animationDelay: `${i * 70}ms` }}>
                {loading ? "…" : k.value}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-white/80">{k.label}</div>
            </button>
          ))}
        </div>
      </div>

      {notice && <div className="mb-4 rounded-md bg-green-950 px-3 py-2 text-sm text-green-300">{notice}</div>}
      {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300 ring-1 ring-red-900">{error}</div>}

      {/* New customer requests — need a date & time */}
      {canManage && newRequests.length > 0 && (
        <section className="mb-6 rounded-2xl border border-red-800 bg-red-950/20 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-red-400">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">{newRequests.length}</span>
            New booking requests — set a date &amp; time
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {newRequests.map((b, i) => (
              <div key={b.id} className="flex flex-col rounded-xl bg-neutral-950 p-4 ring-1 ring-neutral-800 animate-pop-in" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">{b.customer?.name}</div>
                    <div className="text-xs text-neutral-400">
                      {b.contactVia === "EMAIL" ? b.contactEmail : b.contactPhone ?? b.customer?.phone}
                      {b.contactVia === "BOTH" && b.contactEmail ? ` · ${b.contactEmail}` : ""}
                    </div>
                  </div>
                  <span className="rounded-full bg-yellow-950 px-2 py-0.5 text-[10px] font-semibold uppercase text-yellow-300 ring-1 ring-yellow-800">
                    {b.contactVia === "EMAIL" ? "Email" : b.contactVia === "BOTH" ? "WhatsApp + email" : "WhatsApp"}
                  </span>
                </div>
                <div className="mt-2 rounded-md bg-yellow-950/30 px-2 py-1 text-sm font-medium text-yellow-200">📅 {preferredText(b)}</div>
                <div className="mt-2 text-sm text-neutral-300">
                  <span className="font-medium text-white">{b.vehicle?.plateNumber}</span> · {b.vehicle?.make} {b.vehicle?.model}
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  {itemNames(b).join(", ")} · <span className="text-neutral-200">{formatMoney(bookingTotal(b))}</span>
                </div>
                {b.customerMessage && <div className="mt-2 line-clamp-3 whitespace-pre-line text-xs italic text-neutral-400">“{b.customerMessage}”</div>}
                <div className="mt-auto flex gap-2 pt-3">
                  <button onClick={() => setProposing(b)} className="flex-1 rounded-full bg-red-600 py-1.5 text-sm font-semibold text-white hover:bg-red-700">
                    Set date &amp; time
                  </button>
                  <button
                    onClick={() => transition(b, "CANCELLED")}
                    disabled={busyId === b.id}
                    className="rounded-full px-4 py-1.5 text-sm text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-900 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Time sent — waiting for the customer */}
      {canManage && awaitingCustomer.length > 0 && (
        <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-300">
            Waiting for the customer to confirm ({awaitingCustomer.length})
          </h2>
          <div className="divide-y divide-neutral-900">
            {awaitingCustomer.map((b) => {
              const t = new Date(b.scheduledAt);
              return (
                <div key={b.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <div className="w-40 font-semibold text-white">
                    {t.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}{" "}
                    {t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="min-w-[160px] flex-1 text-neutral-300">
                    {b.customer?.name} · <span className="text-white">{b.vehicle?.plateNumber}</span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    sent {b.proposedAt ? new Date(b.proposedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                  </div>
                  <button onClick={() => setProposing(b)} className="rounded-full px-3 py-1 text-xs text-neutral-300 ring-1 ring-neutral-700 hover:text-white">
                    Change / resend
                  </button>
                  <button onClick={() => transition(b, "CANCELLED")} className="text-xs text-neutral-500 hover:text-red-400">
                    Cancel
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Needs action */}
      {canManage && requests.length > 0 && (
        <section className="mb-6 rounded-2xl border border-yellow-900/70 bg-yellow-950/10 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-yellow-400">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500 text-[11px] font-bold text-black">{requests.length}</span>
            Waiting for confirmation
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {requests.map((b, i) => {
              const t = new Date(b.scheduledAt);
              return (
                <div key={b.id} className="rounded-xl bg-neutral-950 p-4 ring-1 ring-neutral-800 animate-pop-in" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-white">{b.customer?.name}</div>
                      <div className="text-xs text-neutral-400">{b.customer?.phone}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold text-white">{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                      <div className="text-xs text-neutral-400">{t.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-neutral-300">
                    <span className="font-medium text-white">{b.vehicle?.plateNumber}</span> · {b.vehicle?.make} {b.vehicle?.model}
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">
                    {itemNames(b).join(", ")} · <span className="text-neutral-200">{formatMoney(bookingTotal(b))}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => transition(b, "CONFIRMED")}
                      disabled={busyId === b.id}
                      className="flex-1 rounded-full bg-red-600 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {busyId === b.id ? "…" : "✓ Confirm"}
                    </button>
                    <button
                      onClick={() => transition(b, "CANCELLED")}
                      disabled={busyId === b.id}
                      className="rounded-full px-4 py-1.5 text-sm text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-900 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* View switch */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800">
        <div className="flex">
          {(
            [
              ["list", "List"],
              ["day", "Day calendar"],
              ["week", "Week"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${view === k ? "border-red-600 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {canSetRules && (
          <button onClick={() => setShowRules(true)} className="mb-1 rounded-full px-3 py-1 text-xs text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-900">
            ⚙ Hours &amp; rules
          </button>
        )}
      </div>

      {view === "day" && <DayView date={day} onDate={setDay} canManage={canManage} refreshKey={refreshKey} />}
      {view === "week" && (
        <WeekView
          start={weekStart}
          onStart={setWeekStart}
          refreshKey={refreshKey}
          onPickDay={(d) => {
            setDay(d);
            setView("day");
          }}
        />
      )}

      {view === "list" && (
      <>
      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer, phone, plate or service…"
            aria-label="Search bookings"
            className="w-full rounded-full border border-neutral-700 bg-black py-2 pl-9 pr-4 text-sm text-white focus:border-red-600 focus:outline-none"
          />
        </div>
        <div className="flex rounded-full bg-neutral-900 p-1 ring-1 ring-neutral-800" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              role="tab"
              aria-selected={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${period === p.key ? "bg-red-600 text-white" : "text-neutral-400 hover:text-white"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-neutral-400">
          <input type="checkbox" checked={showWalkIns} onChange={(e) => setShowWalkIns(e.target.checked)} className="accent-red-600" />
          Include walk-ins
        </label>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {GROUPS.map((g) => {
          const n = g.key === "ALL" ? base.length : base.filter((b) => g.statuses.includes(b.status)).length;
          return (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                group === g.key ? "bg-white text-black" : "bg-neutral-900 text-neutral-300 ring-1 ring-neutral-800 hover:ring-neutral-600"
              }`}
            >
              {g.label} <span className={group === g.key ? "text-neutral-500" : "text-neutral-500"}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Schedule */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="relative h-20 overflow-hidden rounded-xl bg-neutral-950 ring-1 ring-neutral-900">
              <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-red-900/20 to-transparent animate-shimmer" />
            </div>
          ))}
        </div>
      ) : days.length === 0 ? (
        <div className="rounded-2xl bg-neutral-950 p-10 text-center ring-1 ring-neutral-900">
          <div className="text-lg font-semibold text-white">No bookings here</div>
          <div className="mt-1 text-sm text-neutral-400">
            {search ? "Try a different search." : "Change the period or status above, or add a new booking."}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {days.map(([key, list]) => {
            const h = dayHeading(new Date(key));
            return (
              <section key={key}>
                <div className="mb-2 flex items-baseline gap-3">
                  <h2 className={`text-lg font-semibold ${h.title === "Today" ? "text-red-500" : "text-white"}`}>{h.title}</h2>
                  <span className="text-sm text-neutral-500">{h.sub}</span>
                  <span className="text-xs text-neutral-600">· {list.length} booking{list.length === 1 ? "" : "s"}</span>
                  {new Date(key) < today && list.some((b) => ACTIVE.includes(b.status)) && (
                    <span className="rounded-full bg-red-950 px-2 py-0.5 text-[11px] font-semibold text-red-300 ring-1 ring-red-900">
                      Date passed — still open
                    </span>
                  )}
                </div>
                <div className="overflow-hidden rounded-2xl bg-neutral-950 ring-1 ring-neutral-800">
                  {list.map((b, i) => (
                    <BookingRow
                      key={b.id}
                      b={b}
                      i={i}
                      canManage={canManage}
                      busy={busyId === b.id}
                      onConfirm={() => transition(b, "CONFIRMED")}
                      onCancel={() => transition(b, "CANCELLED")}
                      onMove={() => setMoving(b)}
                      onPropose={() => setProposing(b)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      </>
      )}

      {moving && (
        <RescheduleModal
          bookingId={moving.id}
          current={moving.scheduledAt}
          title={`${moving.vehicle?.plateNumber} — ${moving.customer?.name}`}
          onClose={() => setMoving(null)}
          onDone={() => {
            setNotice(`Booking for ${moving.vehicle?.plateNumber} moved — ${moving.customer?.name} has been told on WhatsApp.`);
            setMoving(null);
            setRefreshKey((k) => k + 1);
            load();
          }}
        />
      )}
      {proposing && (
        <ProposeTimeModal
          booking={proposing}
          onClose={() => setProposing(null)}
          onSent={(m) => {
            setProposing(null);
            setNotice(m);
            setRefreshKey((k) => k + 1);
            load();
          }}
        />
      )}
      {showRules && (
        <ScheduleSettingsModal
          onClose={() => setShowRules(false)}
          onSaved={() => {
            setShowRules(false);
            setNotice("Opening hours & booking rules saved — they apply to new bookings straight away.");
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {showCreate && (
        <CreateBookingModal
          onClose={() => setShowCreate(false)}
          onCreated={(msg) => {
            setShowCreate(false);
            setNotice(msg);
            setPeriod("upcoming");
            setGroup("ALL");
            setRefreshKey((k) => k + 1);
            load();
          }}
        />
      )}
    </div>
  );
}

function BookingRow({
  b,
  i,
  canManage,
  busy,
  onConfirm,
  onCancel,
  onMove,
  onPropose,
}: {
  b: Booking;
  i: number;
  canManage: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onMove: () => void;
  onPropose: () => void;
}) {
  const isOpenRequest = b.status === "PENDING" && (b.requestStage === "REQUESTED" || b.requestStage === "TIME_PROPOSED");
  const t = new Date(b.scheduledAt);
  const st = STATUS_STYLE[b.status];
  const names = itemNames(b);
  return (
    <div
      className={`group flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-900 px-4 py-3 transition-colors last:border-0 hover:bg-red-950/20 animate-row-in ${
        b.status === "CANCELLED" ? "opacity-50" : ""
      }`}
      style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
    >
      {/* Time */}
      <div className="w-16 shrink-0 text-center">
        <div className="text-lg font-bold leading-none text-white">
          {b.requestStage === "REQUESTED" && b.status === "PENDING" ? "—" : t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        {b.bay?.name && <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">{b.bay.name}</div>}
      </div>
      <div className="hidden h-10 w-px bg-neutral-800 sm:block" />
      {/* Who */}
      <div className="min-w-[160px] flex-1">
        <div className="font-semibold text-white">
          {b.customer?.name}
          {b.isWalkIn && <span className="ml-2 rounded-full bg-red-950 px-1.5 py-px text-[10px] text-red-300">walk-in</span>}
        </div>
        <div className="text-xs text-neutral-500">{b.customer?.phone}</div>
      </div>
      {/* Vehicle */}
      <div className="min-w-[150px]">
        <div className="text-sm font-medium text-neutral-200">{b.vehicle?.plateNumber}</div>
        <div className="text-xs text-neutral-500">
          {b.vehicle?.make} {b.vehicle?.model}
        </div>
      </div>
      {/* Services */}
      <div className="min-w-[180px] flex-[1.3]">
        <div className="truncate text-sm text-neutral-300" title={names.join(", ")}>
          {names.join(", ") || "—"}
        </div>
        <div className="text-xs text-neutral-500">{formatMoney(bookingTotal(b))}</div>
      </div>
      {/* Status */}
      <div className="w-28 shrink-0">
        {isOpenRequest ? (
          <span className="inline-flex rounded-full bg-yellow-950 px-2.5 py-0.5 text-xs font-semibold text-yellow-300 ring-1 ring-yellow-800">
            {b.requestStage === "REQUESTED" ? "Needs a time" : "Customer to confirm"}
          </span>
        ) : (
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
        )}
        {b.requestStage === "REQUESTED" && b.status === "PENDING" && <div className="mt-1 text-[10px] text-yellow-400">{preferredText(b)}</div>}
        {b.currentOwner && <div className="mt-1 truncate text-[10px] text-neutral-500">{b.currentOwner.name}</div>}
      </div>
      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        {canManage && isOpenRequest && (
          <button onClick={onPropose} className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700">
            {b.requestStage === "REQUESTED" ? "Set date & time" : "Change / resend"}
          </button>
        )}
        {canManage && !b.isWalkIn && !isOpenRequest && (b.status === "PENDING" || b.status === "CONFIRMED") && (
          <button onClick={onMove} className="rounded-full px-3 py-1 text-xs text-neutral-300 ring-1 ring-neutral-700 hover:text-white" title="Move to another time">
            ⇄ Move
          </button>
        )}
        {canManage && b.status === "PENDING" && !isOpenRequest && (
          <>
            <button onClick={onConfirm} disabled={busy} className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              Confirm
            </button>
            <button onClick={onCancel} disabled={busy} className="rounded-full px-3 py-1 text-xs text-neutral-400 ring-1 ring-neutral-700 hover:text-white disabled:opacity-50">
              Cancel
            </button>
          </>
        )}
        {canManage && b.status === "CONFIRMED" && (
          <button onClick={onCancel} disabled={busy} className="text-xs text-neutral-500 hover:text-red-400 disabled:opacity-50">
            Cancel
          </button>
        )}
        {b.jobCard && (
          <Link to={`/job-board/${b.jobCard.id}`} className="rounded-full px-3 py-1 text-xs font-medium text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-900 hover:text-white">
            Job card →
          </Link>
        )}
      </div>
    </div>
  );
}

// ── New booking ──────────────────────────────────────────────────────────
function Step({ n, title, children, hint }: { n: number; title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="rounded-xl border border-neutral-800 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">{n}</span>
        {title}
        {hint && <span className="text-xs font-normal text-neutral-500">— {hint}</span>}
      </h3>
      {children}
    </section>
  );
}

const inputCls = "w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white focus:border-red-600 focus:outline-none";

function CreateBookingModal({ onClose, onCreated }: { onClose: () => void; onCreated: (msg: string) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [selServices, setSelServices] = useState<Set<string>>(new Set());
  const [selPackages, setSelPackages] = useState<Set<string>>(new Set());
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    customersApi.listCustomers().then(setCustomers).catch(() => {});
    catalogApi.listServices({ active: true }).then(setServices).catch(() => {});
    catalogApi
      .listPackages()
      .then((ps) => setPackages(ps.filter((p) => p.active)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setVehicleId("");
    if (!customerId) {
      setVehicles([]);
      return;
    }
    customersApi
      .listVehicles(customerId)
      .then((vs) => {
        setVehicles(vs);
        if (vs.length === 1) setVehicleId(vs[0].id);
      })
      .catch(() => {});
  }, [customerId]);

  const duration = useMemo(() => {
    let mins = 0;
    for (const id of selServices) mins += services.find((s) => s.id === id)?.durationMinutes ?? 0;
    for (const id of selPackages) {
      const p = packages.find((x) => x.id === id);
      if (p) mins += packageMinutes(p);
    }
    return mins;
  }, [selServices, selPackages, services, packages]);


  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const vType = vehicle?.vehicleType;
  const total =
    [...selServices].reduce((s, id) => s + (servicePrice(services.find((x) => x.id === id)!, vType) ?? 0), 0) +
    [...selPackages].reduce((s, id) => s + Number(packages.find((p) => p.id === id)?.discountedPrice ?? 0), 0);
  const filtered = customers.filter(
    (c) => !search.trim() || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search.trim())
  );
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setter(n);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customerId || !vehicleId) return setError("Choose the customer and their vehicle (step 1)");
    if (selServices.size + selPackages.size === 0) return setError("Choose at least one service or package (step 2)");
    if (!time) return setError("Pick an available time (step 3)");
    setSaving(true);
    try {
      await bookingsApi.createBooking({
        customerId,
        vehicleId,
        scheduledAt: time,
        items: [...[...selPackages].map((id) => ({ packageId: id })), ...[...selServices].map((id) => ({ serviceId: id }))],
      });
      const c = customers.find((x) => x.id === customerId);
      onCreated(
        `Booking added for ${c?.name} — ${new Date(time).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Confirm it to send the WhatsApp confirmation.`
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const groups: [string, Service[]][] = [
    ["Exterior", services.filter((s) => s.category?.name === "EXTERIOR")],
    ["Interior", services.filter((s) => s.category?.name === "INTERIOR")],
  ];

  return (
    <Modal title="New Booking" onClose={onClose} wide accent>
      <form onSubmit={submit} className="space-y-4">
        <Step n={1} title="Customer & vehicle">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone…" className={`mb-2 ${inputCls}`} />
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls} aria-label="Customer">
              <option value="">Select customer… ({filtered.length})</option>
              {filtered.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.phone}
                </option>
              ))}
            </select>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={!customerId} className={`${inputCls} disabled:opacity-40`} aria-label="Vehicle">
              <option value="">Select vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plateNumber} — {v.make} {v.model} ({vehicleTypeLabel(v.vehicleType)})
                </option>
              ))}
            </select>
          </div>
          {customerId && vehicles.length === 0 && (
            <p className="mt-2 text-xs text-neutral-500">
              No vehicles on file —{" "}
              <Link to={`/customers/${customerId}`} className="text-red-400 hover:underline">
                add one on the customer's page
              </Link>
              .
            </p>
          )}
        </Step>

        <Step n={2} title="Services & packages" hint={vType ? `prices for a ${vType}` : "choose a vehicle to see prices"}>
          {packages.length > 0 && (
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              {packages.map((p) => {
                const on = selPackages.has(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => toggle(selPackages, setSelPackages, p.id)}
                    className={`rounded-lg p-3 text-left text-sm transition ${on ? "bg-red-950/50 ring-2 ring-red-600" : "ring-1 ring-neutral-800 hover:ring-neutral-600"}`}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-white">
                        {on ? "✓ " : ""}
                        {p.name}
                      </span>
                      <span className="text-red-400">{formatMoney(p.discountedPrice)}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">{p.services.map((l) => l.service.name).join(" · ")}</div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {groups.map(([title, list]) => (
              <div key={title} className="rounded-lg ring-1 ring-neutral-800 p-2">
                <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title}</div>
                {list.map((s) => {
                  const price = servicePrice(s, vType);
                  return (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-neutral-200 hover:bg-neutral-900">
                      <input type="checkbox" checked={selServices.has(s.id)} onChange={() => toggle(selServices, setSelServices, s.id)} className="accent-red-600" />
                      <span className="flex-1">{s.name}</span>
                      <span className="text-xs text-neutral-500">{s.durationMinutes}m</span>
                      {price !== null && <span className="w-20 text-right text-xs text-neutral-300">{formatMoney(price)}</span>}
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </Step>

        <Step n={3} title="Date & time">
          <SlotPicker
            load={(d) => bookingsApi.getAvailability(d, duration || undefined)}
            durationMinutes={duration || 60}
            value={time}
            onChange={setTime}
          />
        </Step>

        {/* Summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black px-4 py-3 ring-1 ring-neutral-800">
          <div className="text-sm text-neutral-300">
            {vehicle ? (
              <>
                <span className="font-semibold text-white">{vehicle.plateNumber}</span> ·{" "}
              </>
            ) : null}
            {selServices.size + selPackages.size} item(s)
            {time && <> · {new Date(time).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
            <div className="text-lg font-bold text-white">{formatMoney(total)}</div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-gradient-to-r from-red-600 to-red-700 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-600/30 transition hover:-translate-y-0.5 disabled:opacity-50"
          >
            {saving ? "Booking…" : "Create booking"}
          </button>
        </div>
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300 ring-1 ring-red-900">{error}</div>}
      </form>
    </Modal>
  );
}
