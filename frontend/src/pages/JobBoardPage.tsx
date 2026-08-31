import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as jobCardsApi from "../api/jobCards";
import * as bookingsApi from "../api/bookings";
import type { BookingStatus, JobCard } from "../api/types";
import { apiErrorMessage } from "../api/client";

interface Column {
  status: BookingStatus;
  label: string;
  next?: BookingStatus;
  nextLabel?: string;
}

const COLUMNS: Column[] = [
  { status: "CONFIRMED", label: "Waiting", next: "IN_PROGRESS", nextLabel: "Start Job" },
  { status: "IN_PROGRESS", label: "In Progress", next: "QUALITY_CHECK", nextLabel: "Send to QC" },
  { status: "QUALITY_CHECK", label: "Quality Check", next: "READY", nextLabel: "Mark Ready" },
  { status: "READY", label: "Ready", next: "COMPLETED", nextLabel: "Complete" },
  { status: "COMPLETED", label: "Completed" },
];

export function JobBoardPage() {
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await jobCardsApi.listJobCards();
      setJobCards(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function advance(jobCard: JobCard, next: BookingStatus) {
    setBusyId(jobCard.id);
    setError(null);
    try {
      await bookingsApi.updateBookingStatus(jobCard.bookingId, next);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-800">Job Board</h1>
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {COLUMNS.map((col) => {
          const cards = jobCards.filter((j) => j.status === col.status);
          return (
            <div key={col.status} className="rounded-lg bg-slate-100 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">{col.label}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.map((j) => (
                  <div key={j.id} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
                    <Link to={`/job-cards/${j.id}`} className="block text-sm font-medium text-slate-800 hover:underline">
                      {j.booking.vehicle?.plateNumber}
                    </Link>
                    <div className="text-xs text-slate-500">{j.booking.customer?.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {j.technicians.length > 0
                        ? j.technicians.map((t) => t.user.name).join(", ")
                        : "No technician assigned"}
                    </div>
                    {col.next && (
                      <button
                        onClick={() => advance(j, col.next!)}
                        disabled={busyId === j.id}
                        className="mt-2 w-full rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        {busyId === j.id ? "..." : col.nextLabel}
                      </button>
                    )}
                  </div>
                ))}
                {cards.length === 0 && <div className="px-1 py-2 text-xs text-slate-400">Empty</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
