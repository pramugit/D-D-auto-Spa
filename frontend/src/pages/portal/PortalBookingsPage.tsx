import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as portalApi from "../../api/portal";
import type { Booking } from "../../api/types";
import { apiErrorMessage } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";

export function PortalBookingsPage() {
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">My Bookings</h1>
        <Link
          to="/portal/book"
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          + New Booking
        </Link>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="text-slate-400">Loading...</div>
      ) : bookings.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-400">
          No bookings yet. <Link to="/portal/book" className="text-slate-700 hover:underline">Book your first service</Link>.
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <Link
              key={b.id}
              to={`/portal/bookings/${b.id}`}
              className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-800">
                    {b.vehicle?.plateNumber} — {b.vehicle?.make} {b.vehicle?.model}
                  </div>
                  <div className="text-sm text-slate-500">{new Date(b.scheduledAt).toLocaleString()}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {b.services?.map((s) => s.service?.name ?? s.package?.name).join(", ")}
                  </div>
                </div>
                <StatusBadge status={b.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
