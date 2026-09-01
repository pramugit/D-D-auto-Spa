import { useEffect, useState, type FormEvent } from "react";
import * as bookingsApi from "../api/bookings";
import * as customersApi from "../api/customers";
import * as catalogApi from "../api/catalog";
import type { Booking, BookingStatus, Customer, Service, Vehicle } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../hooks/useAuth";
import { canEdit } from "../config/permissions";

const STATUS_FILTERS: (BookingStatus | "ALL")[] = [
  "ALL",
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "QUALITY_CHECK",
  "READY",
  "COMPLETED",
  "CANCELLED",
];

export function BookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<BookingStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canManage = user && canEdit(user.role, "bookings");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await bookingsApi.listBookings(filter === "ALL" ? undefined : { status: filter });
      setBookings(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function handleTransition(bookingId: string, status: BookingStatus) {
    setBusyId(bookingId);
    setError(null);
    try {
      await bookingsApi.updateBookingStatus(bookingId, status);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Bookings</h1>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            + New Booking
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === s ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Date/Time</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Vehicle</th>
              <th className="px-4 py-2">Services</th>
              <th className="px-4 py-2">Bay</th>
              <th className="px-4 py-2">Status</th>
              {canManage && <th className="px-4 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            ) : bookings.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No bookings found.
                </td>
              </tr>
            ) : (
              bookings.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-600">{new Date(b.scheduledAt).toLocaleString()}</td>
                  <td className="px-4 py-2 text-slate-800">{b.customer?.name}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {b.vehicle?.plateNumber} ({b.vehicle?.vehicleType})
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {b.services?.map((s) => s.service?.name ?? s.package?.name).join(", ")}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{b.bay?.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={b.status} />
                  </td>
                  {canManage && (
                    <td className="px-4 py-2">
                      {b.status === "PENDING" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleTransition(b.id, "CONFIRMED")}
                            disabled={busyId === b.id}
                            className="rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => handleTransition(b.id, "CANCELLED")}
                            disabled={busyId === b.id}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateBookingModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateBookingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    customersApi.listCustomers().then(setCustomers).catch(() => {});
    catalogApi.listServices({ active: true }).then(setServices).catch(() => {});
  }, []);

  useEffect(() => {
    if (!customerId) {
      setVehicles([]);
      setVehicleId("");
      return;
    }
    customersApi.listVehicles(customerId).then(setVehicles).catch(() => {});
  }, [customerId]);

  useEffect(() => {
    if (!date) {
      setSlots([]);
      return;
    }
    const durationMinutes = Array.from(selectedServices).reduce((sum, id) => {
      const svc = services.find((s) => s.id === id);
      return sum + (svc?.durationMinutes ?? 0);
    }, 0);
    bookingsApi
      .getAvailability(date, durationMinutes || undefined)
      .then((res) => setSlots(res.slots))
      .catch(() => setSlots([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, selectedServices, services]);

  function toggleService(id: string) {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const exteriorServices = services.filter((s) => s.category?.name === "EXTERIOR");
  const interiorServices = services.filter((s) => s.category?.name === "INTERIOR");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customerId || !vehicleId) {
      setError("Select a customer and vehicle");
      return;
    }
    if (selectedServices.size === 0) {
      setError("Select at least one service");
      return;
    }
    if (!time) {
      setError("Select an available time slot");
      return;
    }
    setSaving(true);
    try {
      await bookingsApi.createBooking({
        customerId,
        vehicleId,
        scheduledAt: time,
        items: Array.from(selectedServices).map((id) => ({ serviceId: id })),
      });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Booking" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Customer</label>
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.phone}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Vehicle</label>
            <select
              required
              disabled={!customerId}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="">Select vehicle...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plateNumber} — {v.make} {v.model} ({v.vehicleType})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600">Services</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-slate-200 p-2">
              <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Exterior</div>
              {exteriorServices.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={selectedServices.has(s.id)} onChange={() => toggleService(s.id)} />
                  {s.name}
                </label>
              ))}
              {exteriorServices.length === 0 && <div className="px-2 py-1 text-xs text-slate-400">None</div>}
            </div>
            <div className="rounded-md border border-slate-200 p-2">
              <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Interior</div>
              {interiorServices.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={selectedServices.has(s.id)} onChange={() => toggleService(s.id)} />
                  {s.name}
                </label>
              ))}
              {interiorServices.length === 0 && <div className="px-2 py-1 text-xs text-slate-400">None</div>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setTime("");
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Available time slots</label>
            <select
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={!date}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="">Select a time...</option>
              {slots
                .filter((s) => s.available)
                .map((s) => (
                  <option key={s.time} value={s.time}>
                    {new Date(s.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </option>
                ))}
            </select>
            {date && slots.filter((s) => s.available).length === 0 && (
              <div className="mt-1 text-xs text-amber-600">No slots available for this date.</div>
            )}
          </div>
        </div>

        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Booking..." : "Create Booking"}
        </button>
      </form>
    </Modal>
  );
}
