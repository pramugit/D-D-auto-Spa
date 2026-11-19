import { useState } from "react";
import * as portalApi from "../api/portal";
import type { Booking } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { formatMoney } from "../utils/money";

const day = (s?: string | null) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "";
const TIME_OF_DAY = { MORNING: "morning", AFTERNOON: "afternoon", ANY: "any time" } as const;

export function preferredText(b: Booking) {
  if (!b.preferredFrom) return "";
  const range = b.preferredFrom === b.preferredTo ? day(b.preferredFrom) : `${day(b.preferredFrom)} – ${day(b.preferredTo)}`;
  return `${range}, ${TIME_OF_DAY[b.preferredTime ?? "ANY"]}`;
}

/** Customer side of a booking request: waiting for a time, or confirm the offered time. */
export function BookingRequestPanel({ booking, minutes, onChanged }: { booking: Booking; minutes?: number; onChanged: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (booking.status !== "PENDING" || !booking.requestStage || booking.requestStage === "ACCEPTED") return null;

  const total = (booking.services ?? []).reduce((s, x) => s + Number(x.price), 0);
  const start = new Date(booking.scheduledAt);
  const end = minutes ? new Date(start.getTime() + minutes * 60000) : null;
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await portalApi.acceptBookingTime(booking.id);
      onChanged("Booking confirmed — see you then!");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function other() {
    setBusy(true);
    setError(null);
    try {
      await portalApi.askAnotherTime(booking.id, msg.trim() || undefined);
      setAsking(false);
      onChanged("We'll find you another time and let you know.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (booking.requestStage === "REQUESTED") {
    return (
      <div className="animate-pop-in mb-6 rounded-xl border border-yellow-800 bg-yellow-950/40 p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-yellow-400">Request sent</div>
        <h2 className="mt-1 text-lg font-bold text-white">We're finding the best time for you</h2>
        <p className="mt-1 text-sm text-neutral-300">
          You asked for <span className="text-white">{preferredText(booking)}</span>. We'll send the exact date and time by{" "}
          {booking.contactVia === "EMAIL" ? "email" : booking.contactVia === "BOTH" ? "WhatsApp and email" : "WhatsApp"} — then confirm it here.
        </p>
        {booking.customerMessage && <p className="mt-2 whitespace-pre-line text-xs text-neutral-400">Your message: {booking.customerMessage}</p>}
      </div>
    );
  }

  // TIME_PROPOSED
  return (
    <div className="animate-pop-in mb-6 overflow-hidden rounded-xl border border-red-700 bg-gradient-to-br from-red-700 to-red-900 p-5 text-white shadow-lg">
      <div className="text-xs font-semibold uppercase tracking-wide text-red-200">Please confirm your booking time</div>
      <div className="mt-2 text-2xl font-bold">{start.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
      <div className="text-lg">
        {t(start)}
        {end && <> – about {t(end)}</>}
      </div>
      <div className="mt-2 text-sm text-red-100">
        {(booking.services ?? []).map((x) => x.package?.name ?? x.service?.name).join(", ")} · estimated {formatMoney(total)}
      </div>
      {booking.staffNote && <div className="mt-2 rounded-md bg-black/30 px-3 py-2 text-sm">Note from us: {booking.staffNote}</div>}
      {error && <div className="mt-3 rounded-md bg-black/40 px-3 py-2 text-sm text-red-200">{error}</div>}
      {asking ? (
        <div className="mt-4 space-y-2">
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value.slice(0, 300))}
            rows={2}
            placeholder="Which days or times would suit you better?"
            className="w-full rounded-md border border-red-400/40 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-red-200/60"
          />
          <div className="flex gap-2">
            <button onClick={other} disabled={busy} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
              Send
            </button>
            <button onClick={() => setAsking(false)} className="rounded-full px-4 py-2 text-sm text-red-100 ring-1 ring-red-300/50 hover:bg-black/20">
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={accept} disabled={busy} className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-red-700 shadow hover:bg-red-50 disabled:opacity-50">
            {busy ? "Confirming…" : "✓ Confirm booking"}
          </button>
          <button onClick={() => setAsking(true)} className="rounded-full px-5 py-2.5 text-sm font-medium text-white ring-1 ring-red-200/60 hover:bg-black/20">
            Ask for another time
          </button>
        </div>
      )}
    </div>
  );
}
