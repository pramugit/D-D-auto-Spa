import { preferredText } from "../../components/BookingRequestPanel";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as portalApi from "../../api/portal";
import type { Booking } from "../../api/types";
import { apiErrorMessage } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";
import { useCustomerAuth } from "../../hooks/useCustomerAuth";

function CarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-neutral-300">
      <path
        d="M3 13l1.5-4.5A2 2 0 016.4 7h11.2a2 2 0 011.9 1.5L21 13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="3" y="13" width="18" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7.5" cy="18" r="1.5" fill="currentColor" />
      <circle cx="16.5" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

const ACTIVE_STATUSES = ["PENDING", "CONFIRMED", "IN_PROGRESS", "QUALITY_CHECK", "READY"];

export function PortalBookingsPage() {
  const { customer } = useCustomerAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi
      .listMyBookings()
      .then(setBookings)
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const firstName = customer?.name?.split(" ")[0];
  const activeCount = bookings.filter((b) => ACTIVE_STATUSES.includes(b.status)).length;

  return (
    <div>
      <div className="animate-pop-in relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-black via-red-950 to-red-950 p-6 text-white shadow-lg">
        <div className="animate-blob pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-red-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-red-300">
              {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
            </p>
            <h1 className="mt-1 text-2xl font-bold">Your bookings, at a glance</h1>
            <p className="mt-1 text-sm text-neutral-300">
              {activeCount > 0
                ? `You have ${activeCount} active booking${activeCount > 1 ? "s" : ""} in progress.`
                : "No active bookings right now — ready for your next visit?"}
            </p>
          </div>
          <Link
            to="/portal/book"
            className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-red-500"
          >
            + New Booking
          </Link>
        </div>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="text-neutral-500">Loading...</div>
      ) : bookings.length === 0 ? (
        <div className="animate-pop-in flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-700 bg-neutral-900 p-10 text-center">
          <CarIcon />
          <div className="text-neutral-400">
            No bookings yet.{" "}
            <Link to="/portal/book" className="font-medium text-red-500 hover:underline">
              Book your first service
            </Link>
            .
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b, i) => (
            <Link
              key={b.id}
              to={`/portal/bookings/${b.id}`}
              style={{ animationDelay: `${Math.min(i, 8) * 0.06}s` }}
              className="animate-fade-in-up block rounded-xl border border-neutral-800 bg-neutral-900 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-red-900 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-white">
                    {b.vehicle?.plateNumber} — {b.vehicle?.make} {b.vehicle?.model}
                  </div>
                  <div className="text-sm text-neutral-400">
                    {b.status === "PENDING" && b.requestStage === "REQUESTED"
                      ? `Requested: ${preferredText(b)}`
                      : new Date(b.scheduledAt).toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {b.services?.map((s) => s.service?.name ?? s.package?.name).join(", ")}
                  </div>
                </div>
                {b.status === "PENDING" && b.requestStage === "TIME_PROPOSED" ? (
                  <span className="animate-pulse rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">Confirm your time →</span>
                ) : b.status === "PENDING" && b.requestStage === "REQUESTED" ? (
                  <span className="rounded-full bg-yellow-950 px-3 py-1 text-xs font-medium text-yellow-300 ring-1 ring-yellow-800">Finding a time</span>
                ) : (
                  <StatusBadge status={b.status} />
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
