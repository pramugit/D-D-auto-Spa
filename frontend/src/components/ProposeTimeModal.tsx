import { useEffect, useState, type FormEvent } from "react";
import * as bookingsApi from "../api/bookings";
import type { Booking } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { Modal } from "./Modal";
import { SlotPicker } from "./SlotPicker";
import { formatMoney } from "../utils/money";
import { formatMinutes } from "../utils/duration";
import { preferredText } from "./BookingRequestPanel";

const CONTACT_LABEL = { WHATSAPP: "WhatsApp", EMAIL: "Email", BOTH: "WhatsApp + email" } as const;

/**
 * Staff answer a booking request: pick the exact start inside the opening
 * hours (the job length comes from the catalog), add an optional note, and
 * send. The bay is held and the customer gets all the details to confirm.
 */
export function ProposeTimeModal({ booking, onClose, onSent }: { booking: Booking; onClose: () => void; onSent: (msg: string) => void }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [time, setTime] = useState("");
  const [note, setNote] = useState(booking.staffNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bookingsApi
      .getBooking(booking.id)
      .then((b) => setMinutes(b.estimatedMinutes ?? null))
      .catch(() => setMinutes(null));
  }, [booking.id]);

  const total = (booking.services ?? []).reduce((s, x) => s + Number(x.price), 0);
  const prefersAfternoon = booking.preferredTime === "AFTERNOON";
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = booking.preferredFrom && booking.preferredFrom >= today ? booking.preferredFrom : undefined;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!time) return setError("Pick a start time");
    const h = new Date(time).getHours();
    if (booking.preferredTime === "MORNING" && h >= 12 && !confirm("The customer asked for the morning. Send an afternoon time anyway?")) return;
    if (prefersAfternoon && h < 12 && !confirm("The customer asked for the afternoon. Send a morning time anyway?")) return;
    setSaving(true);
    setError(null);
    try {
      const r = await bookingsApi.proposeTime(booking.id, time, note.trim() || undefined);
      const how = r.sentVia.length ? r.sentVia.join(" and ") : "the portal (no message could be sent — check the contact details)";
      onSent(`Time sent to ${booking.customer?.name} by ${how}. The bay is held until they confirm.`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Set date & time — ${booking.customer?.name}`} onClose={onClose} wide accent>
      <form onSubmit={send} className="space-y-4">
        <div className="grid gap-3 rounded-xl bg-neutral-950 p-4 text-sm ring-1 ring-neutral-800 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase text-neutral-500">Vehicle & work</div>
            <div className="text-white">
              {booking.vehicle?.plateNumber} · {booking.vehicle?.make} {booking.vehicle?.model}
            </div>
            <div className="text-neutral-400">{(booking.services ?? []).map((x) => x.package?.name ?? x.service?.name).join(", ")}</div>
            <div className="mt-1 text-neutral-300">
              {formatMoney(total)} · ⏱ {minutes ? formatMinutes(minutes) : "…"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-neutral-500">Customer wants</div>
            <div className="font-semibold text-yellow-300">{preferredText(booking) || "—"}</div>
            <div className="mt-1 text-xs text-neutral-400">
              Send by {CONTACT_LABEL[booking.contactVia ?? "WHATSAPP"]}: {[booking.contactPhone, booking.contactEmail].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          {booking.customerMessage && (
            <div className="sm:col-span-2">
              <div className="text-xs uppercase text-neutral-500">Message</div>
              <div className="whitespace-pre-line text-neutral-200">{booking.customerMessage}</div>
            </div>
          )}
        </div>

        <SlotPicker
          load={(d) => bookingsApi.getAvailability(d, minutes ?? undefined, booking.id)}
          durationMinutes={minutes ?? 60}
          value={time}
          onChange={setTime}
          initialDate={firstDay}
        />

        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 300))}
          placeholder="Note to the customer (optional) — e.g. please bring the service book"
          className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white"
        />
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</div>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-neutral-500">
            The customer gets the date, time, work, price and a link to confirm. The bay is held meanwhile.
          </span>
          <button type="submit" disabled={saving || !time} className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {saving ? "Sending…" : "Send time to customer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
