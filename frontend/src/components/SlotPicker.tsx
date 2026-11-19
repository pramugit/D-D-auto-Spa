import { useEffect, useMemo, useState } from "react";
import type { AvailabilityResponse } from "../api/types";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hm = (t: string | Date) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * The one time picker used everywhere a booking time is chosen (staff new
 * booking, staff reschedule, customer booking, customer reschedule). Shows
 * the next two weeks as quick day buttons, opening hours or why a day is
 * closed, and a slot grid with free bays and the expected finish time. The
 * caller supplies `load` (staff or customer API) so the same server rules apply.
 */
export function SlotPicker({
  load,
  durationMinutes,
  value,
  onChange,
  initialDate,
  days = 14,
}: {
  load: (date: string) => Promise<AvailabilityResponse>;
  durationMinutes: number;
  value: string;
  onChange: (iso: string) => void;
  initialDate?: string;
  days?: number;
}) {
  const [date, setDate] = useState(initialDate ?? iso(new Date()));
  const [res, setRes] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const quickDays = useMemo(() => {
    const t = new Date();
    return Array.from({ length: days }, (_, i) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + i));
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load(date)
      .then((r) => !cancelled && setRes(r))
      .catch(() => !cancelled && setRes(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // durationMinutes changes the free slots
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, durationMinutes]);

  // A chosen time that's no longer offered (other day / duration changed) is cleared.
  useEffect(() => {
    if (value && res && !res.slots.some((s) => s.time === value && s.available)) onChange("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res]);

  const free = res?.slots.filter((s) => s.available) ?? [];
  const finish = value ? new Date(new Date(value).getTime() + (res?.durationMinutes ?? durationMinutes) * 60000) : null;

  return (
    <div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {quickDays.map((d) => {
          const k = iso(d);
          const on = k === date;
          return (
            <button
              type="button"
              key={k}
              onClick={() => setDate(k)}
              className={`flex w-14 shrink-0 flex-col items-center rounded-lg py-1.5 text-xs transition ${
                on ? "bg-red-600 text-white" : d.getDay() === 0 ? "bg-neutral-950 text-neutral-600 ring-1 ring-neutral-900" : "bg-neutral-900 text-neutral-300 ring-1 ring-neutral-800 hover:ring-red-600"
              }`}
            >
              <span className="text-[10px] uppercase">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className="text-base font-bold leading-tight">{d.getDate()}</span>
              <span className="text-[9px] opacity-70">{d.toLocaleDateString(undefined, { month: "short" })}</span>
            </button>
          );
        })}
        <input
          type="date"
          value={date}
          min={iso(new Date())}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label="Pick another date"
          className="shrink-0 rounded-lg border border-neutral-700 bg-black px-2 text-xs text-white"
        />
      </div>

      {loading && !res ? (
        <div className="text-sm text-neutral-500">Checking free times…</div>
      ) : !res ? (
        <div className="text-sm text-red-400">Couldn't load times — try again.</div>
      ) : res.open === false ? (
        <div className="rounded-lg bg-neutral-950 px-3 py-3 text-sm text-neutral-300 ring-1 ring-neutral-800">
          <span className="font-semibold text-white">Not available:</span> {res.closedReason ?? "closed"}. Pick another day.
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
            <span>
              Open {res.opensAt}–{res.closesAt}
            </span>
            <span>about {Math.round((res.durationMinutes ?? durationMinutes) / 6) / 10} h of work</span>
            <span>{free.length} free start time{free.length === 1 ? "" : "s"}</span>
          </div>
          {res.slots.length === 0 ? (
            <div className="text-sm text-neutral-500">The work is longer than the opening hours that day.</div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {res.slots.map((s) => {
                const on = value === s.time;
                const label = s.available ? (s.freeBays === 1 ? "1 bay left" : `${s.freeBays} bays`) : s.reason === "full" ? "full" : s.reason === "too soon" ? "too soon" : "";
                return (
                  <button
                    type="button"
                    key={s.time}
                    disabled={!s.available}
                    onClick={() => onChange(s.time)}
                    title={s.available ? `${s.freeBays} bay(s) free` : s.reason}
                    className={`flex flex-col items-center rounded-md py-1.5 text-xs font-medium transition ${
                      on
                        ? "bg-red-600 text-white"
                        : s.available
                          ? "bg-neutral-900 text-neutral-100 ring-1 ring-neutral-700 hover:ring-red-600"
                          : "cursor-not-allowed bg-neutral-950 text-neutral-700"
                    }`}
                  >
                    <span className={s.available ? "" : "line-through"}>{hm(s.time)}</span>
                    <span className={`text-[9px] ${on ? "text-white/80" : s.available && s.freeBays === 1 ? "text-yellow-400" : "text-neutral-500"}`}>{label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {finish && (
            <div className="mt-2 text-xs text-neutral-300">
              Starts <span className="font-semibold text-white">{hm(value)}</span> · expected to finish around{" "}
              <span className="font-semibold text-white">{hm(finish)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
