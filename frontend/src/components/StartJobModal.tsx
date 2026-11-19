import { useState } from "react";
import * as jobCardsApi from "../api/jobCards";
import * as bookingsApi from "../api/bookings";
import type { JobCard, StaffUser } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { Modal } from "./Modal";

export type TechnicianSummary = Pick<StaffUser, "id" | "name" | "email" | "role">;

/** Assign technician(s) and start a waiting job (Job Board "Start Job"). */
export function StartJobModal({
  jobCard,
  technicians,
  onClose,
  onStarted,
}: {
  jobCard: JobCard;
  technicians: TechnicianSummary[];
  onClose: () => void;
  onStarted: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(jobCard.technicians.map((t) => t.userId))
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const booking = jobCard.booking;
  const currentIds = jobCard.technicians.map((t) => t.userId).sort().join(",");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleStart() {
    setError(null);
    if (selected.size === 0) {
      setError("Assign at least one technician before starting the job");
      return;
    }
    setSaving(true);
    try {
      const selectedIds = Array.from(selected).sort().join(",");
      // Only hit assign-technician (and its WhatsApp notification) when the
      // assignment actually changed — avoids re-notifying the customer
      // every time a job that already has its technician is (re)started.
      if (selectedIds !== currentIds) {
        await jobCardsApi.assignTechnicians(jobCard.id, Array.from(selected));
      }
      await bookingsApi.updateBookingStatus(jobCard.bookingId, "IN_PROGRESS");
      onStarted();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Start Job" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="rounded-md border border-neutral-800 bg-black p-4">
          <div className="flex items-center justify-between">
            <div className="font-medium text-white">
              {booking.vehicle?.plateNumber} — {booking.vehicle?.make} {booking.vehicle?.model}
            </div>
            <div className="text-xs text-neutral-400">{new Date(booking.scheduledAt).toLocaleString()}</div>
          </div>
          <div className="mt-1 text-sm text-neutral-300">
            {booking.customer?.name}
            {booking.customer?.phone ? ` · ${booking.customer.phone}` : ""}
          </div>
          {booking.services && booking.services.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {booking.services.map((s) => (
                <span key={s.id} className="rounded-md bg-neutral-900 px-2 py-1 text-xs text-neutral-300 ring-1 ring-neutral-700">
                  {s.service?.name ?? s.package?.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase text-neutral-400">Assign Technician(s)</h3>
          {technicians.length === 0 ? (
            <div className="text-sm text-neutral-500">No technicians on staff yet.</div>
          ) : (
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {technicians.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-2 rounded-md border border-neutral-800 px-2 py-1.5 text-sm hover:bg-black"
                >
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                  {t.name}
                </label>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            The customer gets a WhatsApp update when the technician assignment changes, and another once the job
            starts.
          </p>
        </div>

        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          onClick={handleStart}
          disabled={saving}
          className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? "Starting..." : "Confirm & Start Job"}
        </button>
      </div>
    </Modal>
  );
}
