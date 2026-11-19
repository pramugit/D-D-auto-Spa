import type { ScheduleSettings } from "../api/types";

export type PreferredTime = "MORNING" | "AFTERNOON" | "ANY";
export type ContactVia = "WHATSAPP" | "EMAIL" | "BOTH";

export interface RequestDetails {
  preferredFrom: string;
  preferredTo: string;
  preferredTime: PreferredTime;
  contactVia: ContactVia;
  contactPhone: string;
  contactEmail: string;
  message: string;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const nice = (s: string) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "";

/** Quick picks for the preferred-date range. */
function quickRanges(): { label: string; from: string; to: string }[] {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const dow = today.getDay(); // 0 Sun
  const saturday = addDays(today, (6 - dow + 7) % 7 || 7);
  const nextMon = addDays(today, ((8 - dow) % 7) || 7);
  return [
    { label: "Tomorrow", from: iso(tomorrow), to: iso(tomorrow) },
    { label: "This week", from: iso(tomorrow), to: iso(saturday < tomorrow ? tomorrow : saturday) },
    { label: "Next week", from: iso(nextMon), to: iso(addDays(nextMon, 5)) },
    { label: "Within 2 weeks", from: iso(tomorrow), to: iso(addDays(today, 14)) },
  ];
}

/** Step 3–4 of the customer booking request: when suits them + how to reach them. */
export function BookingRequestFields({
  value,
  onChange,
  rules,
}: {
  value: RequestDetails;
  onChange: (v: RequestDetails) => void;
  rules: ScheduleSettings | null;
}) {
  const set = (patch: Partial<RequestDetails>) => onChange({ ...value, ...patch });
  const today = iso(new Date());
  const maxDay = iso(addDays(new Date(), rules?.maxDaysAhead ?? 30));
  const closedDays = rules
    ? (Object.entries(rules.hours) as [string, { open: boolean }][])
        .filter(([, h]) => !h.open)
        .map(([d]) => ({ sun: "Sundays", mon: "Mondays", tue: "Tuesdays", wed: "Wednesdays", thu: "Thursdays", fri: "Fridays", sat: "Saturdays" })[d])
    : [];
  const input = "w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white focus:border-red-600 focus:outline-none";
  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium transition ${on ? "bg-red-600 text-white" : "text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-800"}`;

  return (
    <>
      <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase text-neutral-400">3. When suits you?</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Choose the days that work for you. We'll pick the exact time and send it to you to confirm.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {quickRanges().map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => set({ preferredFrom: r.from, preferredTo: r.to })}
              className={chip(value.preferredFrom === r.from && value.preferredTo === r.to)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm text-neutral-300">
            From
            <input
              type="date"
              min={today}
              max={maxDay}
              value={value.preferredFrom}
              onChange={(e) => set({ preferredFrom: e.target.value, preferredTo: value.preferredTo && value.preferredTo < e.target.value ? e.target.value : value.preferredTo || e.target.value })}
              className={`mt-1 ${input}`}
            />
          </label>
          <label className="text-sm text-neutral-300">
            To
            <input
              type="date"
              min={value.preferredFrom || today}
              max={maxDay}
              value={value.preferredTo}
              onChange={(e) => set({ preferredTo: e.target.value })}
              className={`mt-1 ${input}`}
            />
          </label>
        </div>
        {value.preferredFrom && value.preferredTo && (
          <p className="mt-2 text-xs text-neutral-400">
            Any day {value.preferredFrom === value.preferredTo ? `on ${nice(value.preferredFrom)}` : `from ${nice(value.preferredFrom)} to ${nice(value.preferredTo)}`}
            {closedDays.length > 0 && <span className="text-neutral-500"> · we're closed on {closedDays.join(", ")}</span>}
          </p>
        )}
        <div className="mt-4 text-sm text-neutral-300">Time of day</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["MORNING", "Morning"],
              ["AFTERNOON", "Afternoon"],
              ["ANY", "Any time"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" onClick={() => set({ preferredTime: k })} className={chip(value.preferredTime === k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase text-neutral-400">4. How should we reach you?</h2>
        <p className="mb-3 text-xs text-neutral-500">We'll send the date, time and all the details here.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["WHATSAPP", "WhatsApp"],
              ["EMAIL", "Email"],
              ["BOTH", "Both"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" onClick={() => set({ contactVia: k })} className={chip(value.contactVia === k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {value.contactVia !== "EMAIL" && (
            <label className="text-sm text-neutral-300">
              WhatsApp number
              <input
                inputMode="tel"
                value={value.contactPhone}
                onChange={(e) => set({ contactPhone: e.target.value })}
                placeholder="07X XXX XXXX"
                className={`mt-1 ${input}`}
              />
            </label>
          )}
          {value.contactVia !== "WHATSAPP" && (
            <label className="text-sm text-neutral-300">
              Email (Gmail)
              <input
                type="email"
                value={value.contactEmail}
                onChange={(e) => set({ contactEmail: e.target.value })}
                placeholder="you@gmail.com"
                className={`mt-1 ${input}`}
              />
            </label>
          )}
        </div>
        <label className="mt-3 block text-sm text-neutral-300">
          Message (optional)
          <textarea
            value={value.message}
            onChange={(e) => set({ message: e.target.value.slice(0, 500) })}
            rows={3}
            placeholder="Anything we should know — e.g. pick-up needed, a specific problem, best time to call…"
            className={`mt-1 ${input}`}
          />
        </label>
      </div>
    </>
  );
}
