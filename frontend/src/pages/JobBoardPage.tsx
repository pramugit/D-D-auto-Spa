import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import * as jobCardsApi from "../api/jobCards";
import * as bookingsApi from "../api/bookings";
import * as usersApi from "../api/users";
import type { BookingStatus, JobCard } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { canEdit } from "../config/permissions";
import { JOB_STATUS_FLOW, PHOTO_STATUSES } from "../config/jobCardWorkflow";
import { CameraCaptureModal } from "../components/CameraCaptureModal";
import { StartJobModal, type TechnicianSummary } from "../components/StartJobModal";
import { JobQuickView } from "../components/jobBoard/JobQuickView";
import {
  INVOICE_BADGE,
  STAGE_ORDER,
  STAGE_STYLE,
  fmtDuration,
  fmtTime,
  initials,
  isToday,
  jobFlags,
  jobValue,
  minutesInStage,
  money,
  serviceNames,
  stageSince,
  startOfToday,
} from "../components/jobBoard/jobBoardUtils";

type View = "board" | "list";
type Scope = "open" | "today" | "week" | "all";
type Source = "all" | "booking" | "walkin";
type SortKey = "stage" | "time" | "scheduled" | "value";

const SCOPES: { key: Scope; label: string }[] = [
  { key: "open", label: "Open + done today" },
  { key: "today", label: "Today's schedule" },
  { key: "week", label: "Last 7 days" },
  { key: "all", label: "Everything" },
];

const REFRESH_MS = 30_000;

function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Job Board — the workshop's control room. Every job (bookings and walk-ins)
 * on one screen: live KPIs, technician workload, attention flags, a
 * drag-and-drop stage board or a sortable list, and a quick-view panel to
 * act on a job without leaving the page. Auto-refreshes every 30 seconds.
 */
export function JobBoardPage() {
  const { user } = useAuth();
  const canAct = !!user && canEdit(user.role, "jobBoard");

  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [view, setView] = useState<View>(() => readPref<View>("jobBoard.view", "board"));
  const [scope, setScope] = useState<Scope>(() => readPref<Scope>("jobBoard.scope", "open"));
  const [source, setSource] = useState<Source>("all");
  const [techFilter, setTechFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "stage", dir: 1 });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [startingJob, setStartingJob] = useState<JobCard | null>(null);
  const [cameraFor, setCameraFor] = useState<JobCard | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<BookingStatus | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const data = await jobCardsApi.listJobCards();
      setJobs(data);
      setLastLoaded(Date.now());
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    usersApi.listTechnicians().then(setTechnicians).catch(() => {});
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  useEffect(() => writePref("jobBoard.view", view), [view]);
  useEffect(() => writePref("jobBoard.scope", scope), [scope]);

  // ── Actions ────────────────────────────────────────────────────────────
  async function advance(job: JobCard) {
    const step = JOB_STATUS_FLOW.find((s) => s.status === job.status);
    if (!step?.next) return;
    if (job.status === "CONFIRMED") {
      setStartingJob(job);
      return;
    }
    setBusyId(job.id);
    setError(null);
    setNotice(null);
    try {
      await bookingsApi.updateBookingStatus(job.bookingId, step.next);
      const nextLabel = JOB_STATUS_FLOW.find((s) => s.status === step.next)?.label;
      setNotice(`${job.booking.vehicle?.plateNumber} moved to ${nextLabel}.`);
      await load(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function sendPhoto(job: JobCard, file: File) {
    setSendingId(job.id);
    setError(null);
    setNotice(null);
    try {
      const photo = await jobCardsApi.uploadPhoto(job.id, file, "PROGRESS");
      await jobCardsApi.sendPhotoWhatsApp(job.id, photo.id);
      setNotice(`Photo sent to ${job.booking.customer?.name} on WhatsApp.`);
      await load(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSendingId(null);
    }
  }

  function onDrop(target: BookingStatus) {
    const job = jobs.find((j) => j.id === dragId);
    setDragId(null);
    setDragOver(null);
    if (!job) return;
    const next = JOB_STATUS_FLOW.find((s) => s.status === job.status)?.next;
    if (next !== target) return;
    advance(job);
  }

  // ── Derived data ───────────────────────────────────────────────────────
  const today0 = startOfToday();

  const inScope = useMemo(() => {
    return jobs.filter((j) => {
      if (j.status === "CANCELLED") return false;
      const sched = new Date(j.booking.scheduledAt).getTime();
      switch (scope) {
        case "open":
          return j.status !== "COMPLETED" || isToday(j.completedAt ?? stageSince(j));
        case "today":
          return sched >= today0 && sched < today0 + 86_400_000;
        case "week":
          return sched >= today0 - 6 * 86_400_000;
        default:
          return true;
      }
    });
  }, [jobs, scope, today0]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return inScope.filter((j) => {
      if (source === "booking" && j.booking.isWalkIn) return false;
      if (source === "walkin" && !j.booking.isWalkIn) return false;
      if (techFilter === "none" && j.technicians.length > 0) return false;
      if (techFilter !== "all" && techFilter !== "none" && !j.technicians.some((t) => t.userId === techFilter)) return false;
      if (attentionOnly && jobFlags(j, now).length === 0) return false;
      if (!q) return true;
      const b = j.booking;
      const hay = [b.vehicle?.plateNumber, b.vehicle?.make, b.vehicle?.model, b.customer?.name, ...serviceNames(j)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (hay.includes(q) || hay.replace(/[\s-]/g, "").includes(q.replace(/[\s-]/g, ""))) return true;
      if (qDigits.length >= 3 && (b.customer?.phone ?? "").replace(/\D/g, "").includes(qDigits)) return true;
      if (j.invoice && qDigits && String(j.invoice.invoiceNumber).includes(qDigits)) return true;
      return false;
    });
  }, [inScope, source, techFilter, attentionOnly, search, now]);

  const kpis = useMemo(() => {
    const open = jobs.filter((j) => j.status !== "COMPLETED" && j.status !== "CANCELLED");
    const doneToday = jobs.filter((j) => j.status === "COMPLETED" && isToday(j.completedAt ?? stageSince(j)));
    return {
      open: open.length,
      waiting: open.filter((j) => j.status === "CONFIRMED").length,
      workshop: open.filter((j) => j.status === "IN_PROGRESS" || j.status === "QUALITY_CHECK").length,
      ready: open.filter((j) => j.status === "READY").length,
      doneToday: doneToday.length,
      valueToday: doneToday.reduce((s, j) => s + jobValue(j), 0),
      pipelineValue: open.reduce((s, j) => s + jobValue(j), 0),
      attention: open.filter((j) => jobFlags(j, now).length > 0).length,
    };
  }, [jobs, now]);

  const workload = useMemo(() => {
    const open = jobs.filter((j) => j.status !== "COMPLETED" && j.status !== "CANCELLED");
    const rows = technicians.map((t) => {
      const mine = open.filter((j) => j.technicians.some((x) => x.userId === t.id));
      return {
        id: t.id,
        name: t.name,
        active: mine.filter((j) => j.status === "IN_PROGRESS" || j.status === "QUALITY_CHECK").length,
        queued: mine.filter((j) => j.status === "CONFIRMED").length,
        total: mine.length,
      };
    });
    const max = Math.max(1, ...rows.map((r) => r.total));
    return { rows: rows.sort((a, b) => b.total - a.total), max, unassigned: open.filter((j) => j.technicians.length === 0).length };
  }, [jobs, technicians]);

  const sortedList = useMemo(() => {
    const val = (j: JobCard): number => {
      switch (sort.key) {
        case "stage":
          return STAGE_ORDER.indexOf(j.status) * 1e7 - minutesInStage(j, now);
        case "time":
          return minutesInStage(j, now);
        case "scheduled":
          return new Date(j.booking.scheduledAt).getTime();
        case "value":
          return jobValue(j);
      }
    };
    return [...filtered].sort((a, b) => (val(a) - val(b)) * sort.dir);
  }, [filtered, sort, now]);

  const selected = jobs.find((j) => j.id === selectedId) ?? null;
  const filtersActive = source !== "all" || techFilter !== "all" || attentionOnly || search.trim() !== "";
  const dragged = jobs.find((j) => j.id === dragId);
  const dropTarget = dragged ? JOB_STATUS_FLOW.find((s) => s.status === dragged.status)?.next : undefined;

  function clearFilters() {
    setSource("all");
    setTechFilter("all");
    setAttentionOnly(false);
    setSearch("");
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Job Board</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {new Date(now).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
            {lastLoaded && (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Live · updated {fmtDuration(Math.floor((now - lastLoaded) / 60000))}
                  {now - lastLoaded < 60000 ? "" : " ago"}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => load()}
            disabled={refreshing}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "↻ Refresh"}
          </button>
          <Link to="/bookings" className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800">
            Bookings
          </Link>
          {canAct && (
            <Link to="/daily-jobs" className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
              + New walk-in
            </Link>
          )}
        </div>
      </div>

      {notice && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
          {notice}
          <button onClick={() => setNotice(null)} className="text-emerald-500 hover:text-emerald-200" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-200" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Open jobs" value={kpis.open} sub={`${kpis.waiting} waiting to start`} />
        <Kpi label="In the workshop" value={kpis.workshop} sub="In progress + quality check" accent="text-amber-300" />
        <Kpi label="Ready for pickup" value={kpis.ready} sub="Call the customer" accent="text-emerald-300" />
        <Kpi label="Completed today" value={kpis.doneToday} sub={money(kpis.valueToday)} />
        <Kpi label="Open job value" value={money(kpis.pipelineValue)} sub="Not yet completed" small />
        <button
          onClick={() => setAttentionOnly((v) => !v)}
          className={`rounded-lg border p-4 text-left transition ${
            attentionOnly
              ? "border-red-600 bg-red-950/60"
              : kpis.attention > 0
                ? "border-red-900 bg-red-950/20 hover:border-red-700"
                : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
          }`}
        >
          <div className="text-xs uppercase tracking-wide text-neutral-400">Needs attention</div>
          <div className={`mt-1 text-3xl font-bold ${kpis.attention > 0 ? "text-red-400" : "text-white"}`}>{kpis.attention}</div>
          <div className="mt-1 text-xs text-neutral-500">{attentionOnly ? "Showing only these — tap to clear" : "Tap to show only these"}</div>
        </button>
      </div>

      {/* Technician workload */}
      {(workload.rows.length > 0 || workload.unassigned > 0) && (
        <div className="mb-5 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Technician workload</h2>
            {techFilter !== "all" && (
              <button onClick={() => setTechFilter("all")} className="text-xs text-red-400 hover:text-red-300">
                Show everyone
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {workload.rows.map((t) => (
              <button
                key={t.id}
                onClick={() => setTechFilter((f) => (f === t.id ? "all" : t.id))}
                className={`min-w-[170px] shrink-0 rounded-md border px-3 py-2 text-left transition ${
                  techFilter === t.id ? "border-red-600 bg-red-950/40" : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-700 text-[11px] font-bold text-white">
                    {initials(t.name)}
                  </span>
                  <span className="truncate text-sm font-medium text-white">{t.name}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-neutral-800">
                  <div
                    className={`h-1.5 rounded-full ${t.total === 0 ? "bg-emerald-600" : t.total >= 4 ? "bg-red-500" : "bg-amber-400"}`}
                    style={{ width: `${t.total === 0 ? 100 : (t.total / workload.max) * 100}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-neutral-400">
                  {t.total === 0 ? "Free" : `${t.active} working · ${t.queued} queued`}
                </div>
              </button>
            ))}
            {workload.unassigned > 0 && (
              <button
                onClick={() => setTechFilter((f) => (f === "none" ? "all" : "none"))}
                className={`min-w-[150px] shrink-0 rounded-md border px-3 py-2 text-left transition ${
                  techFilter === "none" ? "border-amber-500 bg-amber-950/40" : "border-amber-900/60 bg-neutral-950 hover:border-amber-700"
                }`}
              >
                <div className="text-sm font-medium text-amber-300">Unassigned</div>
                <div className="mt-1 text-2xl font-bold text-white">{workload.unassigned}</div>
                <div className="text-[11px] text-neutral-400">jobs need a technician</div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500">
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plate, customer, phone, service, invoice no..."
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 py-2 pl-9 pr-3 text-sm text-white placeholder:text-neutral-500"
          />
        </div>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
          aria-label="Which jobs"
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
        >
          {SCOPES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            ["all", "All"],
            ["booking", "Bookings"],
            ["walkin", "Walk-ins"],
          ]}
        />
        <select
          value={techFilter}
          onChange={(e) => setTechFilter(e.target.value)}
          aria-label="Technician"
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
        >
          <option value="all">All technicians</option>
          <option value="none">Unassigned</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            ["board", "▦ Board"],
            ["list", "☰ List"],
          ]}
        />
      </div>
      {filtersActive && (
        <div className="mb-3 flex items-center gap-2 text-xs text-neutral-400">
          Showing {filtered.length} of {inScope.length} jobs
          <button onClick={clearFilters} className="text-red-400 hover:text-red-300">
            Clear filters
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {STAGE_ORDER.map((s) => (
            <div key={s} className="h-64 animate-pulse rounded-lg bg-neutral-900" />
          ))}
        </div>
      ) : view === "board" ? (
        /* ── Board ── */
        <div className="grid auto-cols-[minmax(270px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-2">
          {JOB_STATUS_FLOW.map((col) => {
            const cards = filtered
              .filter((j) => j.status === col.status)
              .sort((a, b) => minutesInStage(b, now) - minutesInStage(a, now));
            const st = STAGE_STYLE[col.status];
            const isTarget = dropTarget === col.status;
            const colValue = cards.reduce((s, j) => s + jobValue(j), 0);
            return (
              <div
                key={col.status}
                onDragOver={(e) => {
                  if (isTarget) {
                    e.preventDefault();
                    setDragOver(col.status);
                  }
                }}
                onDragLeave={() => setDragOver((d) => (d === col.status ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(col.status);
                }}
                className={`flex min-h-[300px] flex-col rounded-lg border-t-4 ${st.stripe} bg-neutral-900/70 p-3 transition ${
                  isTarget ? (dragOver === col.status ? "ring-2 ring-red-500" : "ring-1 ring-dashed ring-neutral-600") : ""
                } ${dragId && !isTarget && col.status !== dragged?.status ? "opacity-50" : ""}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
                    <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                    {col.label}
                  </h2>
                  <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-neutral-300">{cards.length}</span>
                </div>
                {cards.length > 0 && <div className="-mt-2 mb-2 text-[11px] text-neutral-500">{money(colValue)}</div>}
                {isTarget && (
                  <div className="mb-2 rounded-md border border-dashed border-red-700 px-2 py-3 text-center text-xs text-red-300">
                    Drop here to {JOB_STATUS_FLOW.find((s) => s.status === dragged?.status)?.nextLabel?.toLowerCase()}
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  {cards.map((j) => (
                    <JobCardTile
                      key={j.id}
                      job={j}
                      now={now}
                      canAct={canAct}
                      busy={busyId === j.id}
                      sending={sendingId === j.id}
                      draggable={canAct && !!col.next}
                      onOpen={() => setSelectedId(j.id)}
                      onAdvance={() => advance(j)}
                      onCamera={() => setCameraFor(j)}
                      onFile={(f) => sendPhoto(j, f)}
                      onDragStart={() => setDragId(j.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOver(null);
                      }}
                    />
                  ))}
                  {cards.length === 0 && (
                    <div className="rounded-md border border-dashed border-neutral-800 px-2 py-6 text-center text-xs text-neutral-600">
                      No jobs
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List ── */
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-neutral-950 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Vehicle</th>
                <th className="px-3 py-2.5 font-medium">Customer</th>
                <SortTh label="Stage" k="stage" sort={sort} setSort={setSort} />
                <SortTh label="In stage" k="time" sort={sort} setSort={setSort} />
                <SortTh label="Scheduled" k="scheduled" sort={sort} setSort={setSort} />
                <th className="px-3 py-2.5 font-medium">Technicians</th>
                <SortTh label="Amount" k="value" sort={sort} setSort={setSort} right />
                <th className="px-3 py-2.5 font-medium">Payment</th>
                <th className="px-3 py-2.5 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {sortedList.map((j) => {
                const st = STAGE_STYLE[j.status];
                const flags = jobFlags(j, now);
                return (
                  <tr
                    key={j.id}
                    onClick={() => setSelectedId(j.id)}
                    className="cursor-pointer border-t border-neutral-800 bg-neutral-900/40 hover:bg-neutral-800/60"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-mono font-semibold text-white">{j.booking.vehicle?.plateNumber}</div>
                      <div className="text-xs text-neutral-500">
                        {j.booking.vehicle?.make} {j.booking.vehicle?.model}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-neutral-200">{j.booking.customer?.name}</div>
                      <div className="text-xs text-neutral-500">{j.booking.customer?.phone}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.soft}`}>
                        {JOB_STATUS_FLOW.find((s) => s.status === j.status)?.label ?? j.status}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 ${flags.some((f) => f.key === "slow") ? "font-semibold text-red-400" : "text-neutral-300"}`}>
                      {fmtDuration(minutesInStage(j, now))}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-300">
                      {fmtTime(j.booking.scheduledAt)}
                      {j.booking.isWalkIn && <span className="ml-1 text-xs text-neutral-500">walk-in</span>}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-300">
                      {j.technicians.length ? j.technicians.map((t) => t.user.name).join(", ") : <span className="text-amber-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-neutral-200">{money(jobValue(j))}</td>
                    <td className="px-3 py-2.5">
                      {j.invoice ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs ${INVOICE_BADGE[j.invoice.status].cls}`}>
                          {INVOICE_BADGE[j.invoice.status].label}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-600">No invoice</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {flags.map((f) => (
                          <span
                            key={f.key}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              f.tone === "red" ? "bg-red-950 text-red-300" : "bg-amber-950 text-amber-300"
                            }`}
                          >
                            {f.label}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedList.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-neutral-500">
                    No jobs match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {canAct && view === "board" && !loading && (
        <p className="mt-3 text-xs text-neutral-600">
          Tip: drag a card into the next column to move it on, or click a card for the full quick view.
        </p>
      )}

      {/* Overlays */}
      {selected && (
        <JobQuickView
          job={selected}
          now={now}
          canAct={canAct}
          busy={busyId === selected.id || sendingId === selected.id}
          technicians={technicians}
          onClose={() => setSelectedId(null)}
          onAdvance={advance}
          onCamera={(j) => setCameraFor(j)}
          onFile={sendPhoto}
          onChanged={() => load(true)}
        />
      )}
      {startingJob && (
        <StartJobModal
          jobCard={startingJob}
          technicians={technicians}
          onClose={() => setStartingJob(null)}
          onStarted={() => {
            setNotice(`${startingJob.booking.vehicle?.plateNumber} started.`);
            setStartingJob(null);
            load(true);
          }}
        />
      )}
      {cameraFor && (
        <CameraCaptureModal
          onClose={() => setCameraFor(null)}
          onCapture={(file) => {
            const j = cameraFor;
            setCameraFor(null);
            sendPhoto(j, file);
          }}
        />
      )}
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────

function JobCardTile({
  job,
  now,
  canAct,
  busy,
  sending,
  draggable,
  onOpen,
  onAdvance,
  onCamera,
  onFile,
  onDragStart,
  onDragEnd,
}: {
  job: JobCard;
  now: number;
  canAct: boolean;
  busy: boolean;
  sending: boolean;
  draggable: boolean;
  onOpen: () => void;
  onAdvance: () => void;
  onCamera: () => void;
  onFile: (f: File) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const b = job.booking;
  const step = JOB_STATUS_FLOW.find((s) => s.status === job.status);
  const flags = jobFlags(job, now);
  const mins = minutesInStage(job, now);
  const names = serviceNames(job);
  const slow = flags.some((f) => f.key === "slow");
  const hasRed = flags.some((f) => f.tone === "red");

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", job.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      role="button"
      tabIndex={0}
      className={`group cursor-pointer rounded-md border bg-neutral-950 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
        hasRed ? "border-red-800 hover:border-red-600" : "border-neutral-800 hover:border-neutral-600"
      } ${draggable ? "active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-base font-bold tracking-wide text-white">{b.vehicle?.plateNumber}</div>
          <div className="truncate text-xs text-neutral-500">
            {b.vehicle?.make} {b.vehicle?.model}
          </div>
        </div>
        <span
          title="Time in this stage"
          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
            slow ? "bg-red-950 text-red-300" : "bg-neutral-800 text-neutral-300"
          }`}
        >
          ⏱ {fmtDuration(mins)}
        </span>
      </div>

      <div className="mt-2 truncate text-sm text-neutral-200">{b.customer?.name}</div>

      {names.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {names.slice(0, 2).map((n, i) => (
            <span key={i} className="max-w-full truncate rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-300">
              {n}
            </span>
          ))}
          {names.length > 2 && <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-400">+{names.length - 2}</span>}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span>
          {b.isWalkIn ? "Walk-in · " : ""}
          {fmtTime(b.scheduledAt)}
          {b.bay ? ` · ${b.bay.name}` : ""}
        </span>
        <span className="font-medium text-neutral-300">{money(jobValue(job))}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex -space-x-1.5">
          {job.technicians.length === 0 ? (
            <span className="text-[11px] text-amber-400">No technician</span>
          ) : (
            job.technicians.slice(0, 3).map((t) => (
              <span
                key={t.userId}
                title={t.user.name}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-red-700 text-[10px] font-bold text-white ring-2 ring-neutral-950"
              >
                {initials(t.user.name)}
              </span>
            ))
          )}
        </div>
        <div className="flex items-center gap-1">
          {job.photos.length > 0 && (
            <span title="Photos" className="text-[11px] text-neutral-500">
              📷 {job.photos.length}
            </span>
          )}
          {job.invoice && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${INVOICE_BADGE[job.invoice.status].cls}`}>
              {INVOICE_BADGE[job.invoice.status].label}
            </span>
          )}
        </div>
      </div>

      {flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {flags.map((f) => (
            <span
              key={f.key}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                f.tone === "red" ? "bg-red-950 text-red-300" : "bg-amber-950 text-amber-300"
              }`}
            >
              ⚠ {f.label}
            </span>
          ))}
        </div>
      )}

      {canAct && (step?.next || PHOTO_STATUSES.includes(job.status)) && (
        <div className="mt-3 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          {step?.next && (
            <button
              onClick={onAdvance}
              disabled={busy}
              className="flex-1 rounded-md bg-red-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "..." : `${step.nextLabel} →`}
            </button>
          )}
          {PHOTO_STATUSES.includes(job.status) &&
            (sending ? (
              <span className="flex-1 rounded-md bg-neutral-800 px-2 py-1.5 text-center text-xs text-neutral-300">Sending...</span>
            ) : (
              <>
                <button
                  onClick={onCamera}
                  title="Take a photo and send it to the customer on WhatsApp"
                  className="rounded-md border border-neutral-700 px-2 py-1.5 text-xs hover:bg-neutral-800"
                >
                  📷
                </button>
                <label
                  title="Choose a photo and send it to the customer on WhatsApp"
                  className="cursor-pointer rounded-md border border-neutral-700 px-2 py-1.5 text-xs hover:bg-neutral-800"
                >
                  🖼️
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </>
            ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent, small }: { label: string; value: ReactNode; sub?: string; accent?: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{label}</div>
      <div className={`mt-1 font-bold ${small ? "text-xl leading-9" : "text-3xl"} ${accent ?? "text-white"}`}>{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="inline-flex rounded-md border border-neutral-700 bg-neutral-900 p-0.5">
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`rounded px-3 py-1.5 text-sm transition ${value === k ? "bg-red-600 font-semibold text-white" : "text-neutral-300 hover:text-white"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SortTh({
  label,
  k,
  sort,
  setSort,
  right,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void;
  right?: boolean;
}) {
  const active = sort.key === k;
  return (
    <th className={`px-3 py-2.5 font-medium ${right ? "text-right" : ""}`}>
      <button
        onClick={() => setSort({ key: k, dir: active ? (sort.dir === 1 ? -1 : 1) : 1 })}
        className={`uppercase tracking-wide hover:text-white ${active ? "text-white" : ""}`}
      >
        {label} {active ? (sort.dir === 1 ? "↑" : "↓") : ""}
      </button>
    </th>
  );
}
