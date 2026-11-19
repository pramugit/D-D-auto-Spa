import { formatMinutes } from "../utils/duration";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as bookingsApi from "../api/bookings";
import type { DaySchedule, ScheduleBooking, WeekSummary } from "../api/bookings";
import type { BookingStatus, ScheduleSettings, Weekday } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { Modal } from "./Modal";
import { SlotPicker } from "./SlotPicker";
import { formatMoney } from "../utils/money";

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const shiftDay = (s: string, n: number) => {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const localMin = (isoTime: string) => {
  const d = new Date(isoTime);
  return d.getHours() * 60 + d.getMinutes();
};

const BLOCK: Record<BookingStatus, string> = {
  PENDING: "bg-yellow-950/90 ring-yellow-700 text-yellow-100",
  CONFIRMED: "bg-neutral-200 ring-white text-neutral-900",
  IN_PROGRESS: "bg-red-600 ring-red-400 text-white",
  QUALITY_CHECK: "bg-red-900 ring-red-600 text-red-50",
  READY: "bg-green-900 ring-green-600 text-green-50",
  COMPLETED: "bg-neutral-800 ring-neutral-700 text-neutral-400",
  CANCELLED: "bg-neutral-950 ring-neutral-800 text-neutral-600 line-through",
};
const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: "Request",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  QUALITY_CHECK: "Quality check",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const PX_PER_MIN = 1.3;

/** Day calendar: bays side by side, bookings drawn at their real times. */
export function DayView({ date, onDate, canManage, refreshKey }: { date: string; onDate: (d: string) => void; canManage: boolean; refreshKey: number }) {
  const [day, setDay] = useState<DaySchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<ScheduleBooking | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      setDay(await bookingsApi.getDaySchedule(date));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000); // move the "now" line
    return () => clearInterval(id);
  }, []);

  const isToday = date === isoDay(new Date());
  const visible = day?.bookings.filter((b) => b.status !== "CANCELLED") ?? [];
  const startMin = day ? Math.min(toMin(day.hours.start), ...visible.map((b) => localMin(b.start))) : 480;
  const endMin = day ? Math.max(toMin(day.hours.end), ...visible.map((b) => localMin(b.start) + b.minutes)) : 1080;
  const height = (endMin - startMin) * PX_PER_MIN;
  const unassigned = visible.filter((b) => !b.bayId || !day?.bays.some((x) => x.id === b.bayId));
  const columns = day ? [...day.bays.map((b) => ({ id: b.id, name: b.name, note: b.status === "MAINTENANCE" ? "maintenance" : "" })), ...(unassigned.length ? [{ id: "__none", name: "No bay", note: "" }] : [])] : [];
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  void tick;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => onDate(shiftDay(date, -1))} className="rounded-full px-3 py-1 text-sm text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-900" aria-label="Previous day">
          ←
        </button>
        <button onClick={() => onDate(isoDay(new Date()))} className={`rounded-full px-3 py-1 text-xs font-semibold ${isToday ? "bg-red-600 text-white" : "text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-900"}`}>
          Today
        </button>
        <button onClick={() => onDate(shiftDay(date, 1))} className="rounded-full px-3 py-1 text-sm text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-900" aria-label="Next day">
          →
        </button>
        <input type="date" value={date} onChange={(e) => e.target.value && onDate(e.target.value)} className="rounded-full border border-neutral-700 bg-black px-3 py-1 text-sm text-white" aria-label="Day" />
        <h2 className="ml-2 text-lg font-semibold text-white">
          {parseDay(date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </h2>
        {day && (
          <span className="text-sm text-neutral-400">
            {day.hours.open ? `Open ${day.hours.start}–${day.hours.end}` : `Closed — ${day.hours.reason}`} · {visible.length} job{visible.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {error && <div className="mb-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</div>}
      {!day ? (
        <div className="text-neutral-500">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-neutral-950 ring-1 ring-neutral-800">
          {!day.hours.open && visible.length === 0 ? (
            <div className="p-10 text-center text-neutral-400">
              <div className="text-lg font-semibold text-white">Closed</div>
              {day.hours.reason}
            </div>
          ) : (
            <div className="flex min-w-[560px]">
              {/* time axis */}
              <div className="w-16 shrink-0 border-r border-neutral-900">
                <div className="h-9 border-b border-neutral-900" />
                <div className="relative" style={{ height }}>
                  {Array.from({ length: Math.floor((endMin - startMin) / 60) + 1 }, (_, i) => {
                    const m = Math.ceil(startMin / 60) * 60 + i * 60;
                    if (m > endMin) return null;
                    return (
                      <div key={m} className="absolute right-2 -translate-y-1/2 text-[11px] text-neutral-500" style={{ top: (m - startMin) * PX_PER_MIN }}>
                        {String(Math.floor(m / 60)).padStart(2, "0")}:00
                      </div>
                    );
                  })}
                </div>
              </div>
              {columns.map((col) => {
                const list = col.id === "__none" ? unassigned : visible.filter((b) => b.bayId === col.id);
                return (
                  <div key={col.id} className="min-w-[200px] flex-1 border-r border-neutral-900 last:border-0">
                    <div className="flex h-9 items-center justify-center border-b border-neutral-900 text-sm font-semibold text-white">
                      {col.name}
                      {col.note && <span className="ml-2 text-[10px] font-normal text-yellow-400">{col.note}</span>}
                    </div>
                    <div className="relative" style={{ height }}>
                      {/* hour lines + out-of-hours shading */}
                      {Array.from({ length: Math.floor((endMin - startMin) / 60) + 1 }, (_, i) => {
                        const m = Math.ceil(startMin / 60) * 60 + i * 60;
                        return m <= endMin ? <div key={m} className="absolute inset-x-0 border-t border-neutral-900" style={{ top: (m - startMin) * PX_PER_MIN }} /> : null;
                      })}
                      {day.hours.open && toMin(day.hours.end) < endMin && (
                        <div className="absolute inset-x-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,0.03)_6px,rgba(255,255,255,0.03)_12px)]" style={{ top: (toMin(day.hours.end) - startMin) * PX_PER_MIN, bottom: 0 }} />
                      )}
                      {isToday && nowMin >= startMin && nowMin <= endMin && (
                        <div className="absolute inset-x-0 z-20 h-0.5 bg-red-500" style={{ top: (nowMin - startMin) * PX_PER_MIN }} />
                      )}
                      {list.map((b) => {
                        const top = (localMin(b.start) - startMin) * PX_PER_MIN;
                        const h = Math.max(26, b.minutes * PX_PER_MIN - 3);
                        return (
                          <button
                            key={b.id}
                            onClick={() => setOpen(b)}
                            className={`absolute inset-x-1.5 z-10 overflow-hidden rounded-lg px-2 py-1 text-left text-xs ring-1 transition hover:z-30 hover:scale-[1.02] animate-pop-in ${BLOCK[b.status]} ${b.clashWith ? "outline outline-2 outline-offset-1 outline-yellow-400" : ""}`}
                            style={{ top, height: h }}
                            title={`${b.startLabel}–${b.endLabel} ${b.customer.name} · ${b.vehicle.plateNumber}`}
                          >
                            <div className="font-semibold">
                              {b.clashWith && <span title="Runs into the next job on this bay">⚠ </span>}
                              {b.startLabel}–{b.endLabel} · {b.vehicle.plateNumber}
                            </div>
                            {h > 40 && (
                              <div className="truncate opacity-80">
                                {b.customer.name} · {b.services.join(", ")}
                              </div>
                            )}
                            {h > 58 && (
                              <div className="opacity-70">
                                {STATUS_LABEL[b.status]}
                                {b.isWalkIn ? " · walk-in" : ""}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-neutral-400">
        {(["PENDING", "CONFIRMED", "IN_PROGRESS", "QUALITY_CHECK", "READY", "COMPLETED"] as BookingStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`h-3 w-3 rounded ring-1 ${BLOCK[s]}`} />
            {STATUS_LABEL[s]}
          </span>
        ))}
        {day && <span>· {day.bufferMinutes} min cleaning gap kept between jobs on a bay</span>}
      </div>

      {open && (
        <BookingQuickView
          b={open}
          canManage={canManage}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function BookingQuickView({ b, canManage, onClose, onChanged }: { b: ScheduleBooking; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const movable = canManage && !b.isWalkIn && (b.status === "PENDING" || b.status === "CONFIRMED");

  async function act(status: BookingStatus) {
    if (status === "CANCELLED" && !confirm("Cancel this booking?")) return;
    setBusy(true);
    try {
      await bookingsApi.updateBookingStatus(b.id, status);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (moving) return <RescheduleModal bookingId={b.id} minutes={b.minutes} current={b.start} title={`${b.vehicle.plateNumber} — ${b.customer.name}`} onClose={onClose} onDone={onChanged} />;
  return (
    <Modal title={`${b.startLabel}–${b.endLabel} · ${b.vehicle.plateNumber}`} onClose={onClose} accent>
      <div className="space-y-2 text-sm">
        <div className="text-white">
          <span className="font-semibold">{b.customer.name}</span> <span className="text-neutral-400">· {b.customer.phone}</span>
        </div>
        <div className="text-neutral-300">
          {b.vehicle.make} {b.vehicle.model} · {STATUS_LABEL[b.status]}
          {b.isWalkIn ? " · walk-in" : ""}
        </div>
        <div className="text-neutral-400">
          {b.services.join(", ")} · <span className="text-white">{formatMoney(b.total)}</span> · about {formatMinutes(b.minutes)}
          {!!b.repairMinutes && <span className="text-yellow-300"> (incl. {formatMinutes(b.repairMinutes)} damage repairs)</span>}
        </div>
        {b.clashWith && (
          <div className="rounded-md bg-yellow-950 px-3 py-2 text-xs text-yellow-200 ring-1 ring-yellow-800">
            ⚠ This job now runs into the next booking on the same bay. Move one of them to another time.
          </div>
        )}
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-red-300">{error}</div>}
        <div className="flex flex-wrap gap-2 pt-2">
          {canManage && b.status === "PENDING" && (
            <button onClick={() => act("CONFIRMED")} disabled={busy} className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
              ✓ Confirm
            </button>
          )}
          {movable && (
            <button onClick={() => setMoving(true)} className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-neutral-200">
              ⇄ Move to another time
            </button>
          )}
          {canManage && (b.status === "PENDING" || b.status === "CONFIRMED") && (
            <button onClick={() => act("CANCELLED")} disabled={busy} className="rounded-full px-4 py-1.5 text-xs text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-900">
              Cancel booking
            </button>
          )}
          {b.jobCardId && (
            <Link to={`/job-board/${b.jobCardId}`} className="rounded-full px-4 py-1.5 text-xs text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-900">
              Job card →
            </Link>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Pick a new time for a booking; the server re-checks the slot and tells the customer. */
export function RescheduleModal({
  bookingId,
  minutes,
  current,
  title,
  onClose,
  onDone,
}: {
  bookingId: string;
  minutes?: number;
  current: string;
  title: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!time) return setError("Pick a new time");
    setSaving(true);
    setError(null);
    try {
      await bookingsApi.rescheduleBooking(bookingId, time, note || undefined);
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Move booking — ${title}`} onClose={onClose} wide accent>
      <form onSubmit={save} className="space-y-3">
        <div className="text-sm text-neutral-400">
          Now: <span className="text-white">{new Date(current).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <SlotPicker
          load={(d) => bookingsApi.getAvailability(d, undefined, bookingId)}
          durationMinutes={minutes ?? 60}
          value={time}
          onChange={setTime}
          initialDate={isoDay(new Date(Math.max(Date.now(), new Date(current).getTime())))}
        />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional — kept on the booking's history)" className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white" />
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</div>}
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500">The customer gets a WhatsApp message with the new time.</span>
          <button type="submit" disabled={saving || !time} className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {saving ? "Moving…" : "Move booking"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Week at a glance: hours, bookings and how full each day is. */
export function WeekView({ start, onStart, onPickDay, refreshKey }: { start: string; onStart: (d: string) => void; onPickDay: (d: string) => void; refreshKey: number }) {
  const [w, setW] = useState<WeekSummary | null>(null);
  useEffect(() => {
    bookingsApi.getWeekSummary(start, 7).then(setW).catch(() => setW(null));
  }, [start, refreshKey]);
  const today = isoDay(new Date());
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => onStart(shiftDay(start, -7))} className="rounded-full px-3 py-1 text-sm text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-900" aria-label="Previous week">
          ←
        </button>
        <button onClick={() => onStart(today)} className="rounded-full px-3 py-1 text-xs font-semibold text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-900">
          This week
        </button>
        <button onClick={() => onStart(shiftDay(start, 7))} className="rounded-full px-3 py-1 text-sm text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-900" aria-label="Next week">
          →
        </button>
        <span className="ml-2 text-sm text-neutral-400">
          {parseDay(start).toLocaleDateString(undefined, { day: "numeric", month: "short" })} – {parseDay(shiftDay(start, 6)).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          {w && ` · ${w.bays} bays`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {(w?.days ?? []).map((d, i) => {
          const date = parseDay(d.date);
          const tone = d.utilization >= 85 ? "bg-red-500" : d.utilization >= 60 ? "bg-yellow-500" : "bg-green-500";
          return (
            <button
              key={d.date}
              onClick={() => onPickDay(d.date)}
              className={`rounded-2xl p-3 text-left ring-1 transition hover:-translate-y-0.5 animate-pop-in ${d.date === today ? "bg-red-950/30 ring-red-700" : "bg-neutral-950 ring-neutral-800 hover:ring-neutral-600"} ${!d.open ? "opacity-60" : ""}`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="text-xs uppercase text-neutral-500">{date.toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div className="text-2xl font-bold text-white">{date.getDate()}</div>
              {d.open ? (
                <>
                  <div className="text-[11px] text-neutral-500">{d.hours}</div>
                  <div className="mt-2 text-sm text-white">
                    {d.bookings} job{d.bookings === 1 ? "" : "s"}
                    {d.pending > 0 && <span className="ml-1 text-[11px] text-yellow-400">· {d.pending} to confirm</span>}
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-neutral-800">
                    <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${Math.max(2, d.utilization)}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-neutral-500">{d.utilization}% of bay time booked</div>
                </>
              ) : (
                <div className="mt-2 text-xs text-neutral-400">Closed{d.closedReason && d.closedReason !== "Closed on this day of the week" ? ` — ${d.closedReason}` : ""}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const DAYS: { key: Weekday; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

/** Opening hours, holidays and booking rules. */
export function ScheduleSettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<ScheduleSettings | null>(null);
  const [holiday, setHoliday] = useState({ date: "", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    bookingsApi.getScheduleSettings().then(setS).catch((err) => setError(apiErrorMessage(err)));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!s) return;
    setSaving(true);
    setError(null);
    try {
      await bookingsApi.saveScheduleSettings(s);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const cls = "rounded-md border border-neutral-700 bg-black px-2 py-1.5 text-sm text-white focus:border-red-600 focus:outline-none";
  const num = (k: keyof ScheduleSettings, label: string, hint: string, opts?: number[]) =>
    s && (
      <label className="text-xs text-neutral-400">
        {label}
        {opts ? (
          <select value={s[k] as number} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} className={`mt-1 block w-full ${cls}`}>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input type="number" min={0} value={s[k] as number} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} className={`mt-1 block w-full ${cls}`} />
        )}
        <span className="mt-0.5 block text-[10px] text-neutral-500">{hint}</span>
      </label>
    );

  return (
    <Modal title="Opening hours & booking rules" onClose={onClose} wide accent>
      {!s ? (
        <div className="text-neutral-500">{error ?? "Loading…"}</div>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-500">Opening hours</h3>
            <div className="space-y-1.5">
              {DAYS.map(({ key, label }) => {
                const d = s.hours[key];
                const set = (patch: Partial<typeof d>) => setS({ ...s, hours: { ...s.hours, [key]: { ...d, ...patch } } });
                return (
                  <div key={key} className="flex flex-wrap items-center gap-3">
                    <label className="flex w-32 items-center gap-2 text-sm text-neutral-200">
                      <input type="checkbox" checked={d.open} onChange={(e) => set({ open: e.target.checked })} className="accent-red-600" />
                      {label}
                    </label>
                    {d.open ? (
                      <>
                        <input type="time" value={d.start} onChange={(e) => set({ start: e.target.value })} className={cls} aria-label={`${label} opens`} />
                        <span className="text-neutral-500">to</span>
                        <input type="time" value={d.end} onChange={(e) => set({ end: e.target.value })} className={cls} aria-label={`${label} closes`} />
                      </>
                    ) : (
                      <span className="text-sm text-neutral-500">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-500">Booking rules</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {num("slotMinutes", "Start times every (minutes)", "e.g. 08:00, 08:30…", [15, 20, 30, 45, 60])}
              {num("bufferMinutes", "Cleaning gap between jobs (minutes)", "kept free on a bay after each job")}
              {num("minNoticeHours", "Customers book at least (hours ahead)", "online bookings only")}
              {num("maxDaysAhead", "Customers book up to (days ahead)", "online bookings only")}
              {num("customerChangeHours", "Customers can change/cancel until (hours before)", "after that they must call")}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-500">Closed dates (holidays, Poya days)</h3>
            <div className="mb-2 flex flex-wrap gap-2">
              <input type="date" value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })} className={cls} aria-label="Closed date" />
              <input value={holiday.reason} onChange={(e) => setHoliday({ ...holiday, reason: e.target.value })} placeholder="Reason, e.g. Poya day" className={`${cls} flex-1`} />
              <button
                type="button"
                onClick={() => {
                  if (!holiday.date || s.closedDates.some((c) => c.date === holiday.date)) return;
                  setS({ ...s, closedDates: [...s.closedDates, { date: holiday.date, reason: holiday.reason || "Closed" }].sort((a, b) => a.date.localeCompare(b.date)) });
                  setHoliday({ date: "", reason: "" });
                }}
                className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-neutral-200"
              >
                + Add
              </button>
            </div>
            {s.closedDates.length === 0 ? (
              <div className="text-xs text-neutral-500">No closed dates.</div>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {s.closedDates.map((c) => (
                  <li key={c.date} className="flex items-center gap-2 rounded-full bg-neutral-900 px-3 py-1 text-xs text-neutral-200 ring-1 ring-neutral-800">
                    {parseDay(c.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · {c.reason}
                    <button type="button" onClick={() => setS({ ...s, closedDates: s.closedDates.filter((x) => x.date !== c.date) })} className="text-neutral-500 hover:text-red-400" aria-label="Remove">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</div>}
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">Applies to new bookings and reschedules straight away (staff and customer portal).</span>
            <button type="submit" disabled={saving} className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
