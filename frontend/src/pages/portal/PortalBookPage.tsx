import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import * as portalApi from "../../api/portal";
import type { Service, Vehicle, VehicleType } from "../../api/types";
import { apiErrorMessage } from "../../api/client";
import { useCustomerAuth } from "../../hooks/useCustomerAuth";

const VEHICLE_TYPES: VehicleType[] = ["SEDAN", "SUV", "HATCHBACK", "VAN", "PICKUP", "OTHER"];

export function PortalBookPage() {
  const { customer } = useCustomerAuth();
  const navigate = useNavigate();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [showAddVehicle, setShowAddVehicle] = useState(false);

  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [time, setTime] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadVehicles() {
    if (!customer) return;
    const v = await portalApi.listMyVehicles(customer.id);
    setVehicles(v);
    if (v.length > 0 && !vehicleId) setVehicleId(v[0].id);
  }

  useEffect(() => {
    loadVehicles().catch((err) => setError(apiErrorMessage(err)));
    portalApi.listActiveServices().then(setServices).catch((err) => setError(apiErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  useEffect(() => {
    if (!date) {
      setSlots([]);
      return;
    }
    const durationMinutes = Array.from(selectedServices).reduce((sum, id) => {
      const svc = services.find((s) => s.id === id);
      return sum + (svc?.durationMinutes ?? 0);
    }, 0);
    portalApi
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

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const exteriorServices = services.filter((s) => s.category?.name === "EXTERIOR");
  const interiorServices = services.filter((s) => s.category?.name === "INTERIOR");

  function priceFor(service: Service): string | null {
    if (!selectedVehicle) return null;
    const p = service.pricing.find((pr) => pr.vehicleType === selectedVehicle.vehicleType);
    return p ? p.price : null;
  }

  const total = Array.from(selectedServices).reduce((sum, id) => {
    const svc = services.find((s) => s.id === id);
    const price = svc ? priceFor(svc) : null;
    return sum + (price ? Number(price) : 0);
  }, 0);

  async function handleConfirm() {
    setError(null);
    if (!vehicleId) {
      setError("Select or add a vehicle");
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
    setSubmitting(true);
    try {
      const booking = await portalApi.createMyBooking({
        vehicleId,
        scheduledAt: time,
        items: Array.from(selectedServices).map((id) => ({ serviceId: id })),
      });
      navigate(`/portal/bookings/${booking.id}`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-800">Book a Service</h1>
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">1. Vehicle</h2>
        {vehicles.length === 0 && !showAddVehicle && (
          <div className="mb-3 text-sm text-slate-500">You don't have any vehicles on file yet.</div>
        )}
        {vehicles.length > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => setVehicleId(v.id)}
                className={`rounded-md border px-3 py-2 text-left text-sm ${
                  vehicleId === v.id ? "border-slate-800 bg-slate-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="font-medium text-slate-800">{v.plateNumber}</div>
                <div className="text-xs text-slate-500">
                  {v.make} {v.model} ({v.vehicleType})
                </div>
              </button>
            ))}
          </div>
        )}
        {!showAddVehicle ? (
          <button onClick={() => setShowAddVehicle(true)} className="text-sm text-slate-600 hover:underline">
            + Add a vehicle
          </button>
        ) : (
          <AddVehicleForm
            onCancel={() => setShowAddVehicle(false)}
            onAdd={async (input) => {
              if (!customer) return;
              const v = await portalApi.addMyVehicle(customer.id, input);
              await loadVehicles();
              setVehicleId(v.id);
              setShowAddVehicle(false);
            }}
          />
        )}
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">2. Services</h2>
        {!selectedVehicle && (
          <div className="mb-3 text-sm text-slate-400">Select a vehicle above to see pricing for your vehicle.</div>
        )}
        {services.length === 0 ? (
          <div className="text-sm text-slate-400">No services are available to book right now.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <ServiceGroup
              title="Exterior"
              services={exteriorServices}
              selected={selectedServices}
              onToggle={toggleService}
              priceFor={priceFor}
              vehicleSelected={!!selectedVehicle}
            />
            <ServiceGroup
              title="Interior"
              services={interiorServices}
              selected={selectedServices}
              onToggle={toggleService}
              priceFor={priceFor}
              vehicleSelected={!!selectedVehicle}
            />
          </div>
        )}
        {selectedServices.size > 0 && (
          <div className="mt-4 text-right text-sm font-semibold text-slate-800">Estimated total: ${total.toFixed(2)}</div>
        )}
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">3. Date &amp; Time</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Date</label>
            <input
              type="date"
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
      </div>

      <button
        onClick={handleConfirm}
        disabled={submitting}
        className="w-full rounded-md bg-slate-800 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {submitting ? "Booking..." : "Confirm Booking"}
      </button>
    </div>
  );
}

function ServiceGroup({
  title,
  services,
  selected,
  onToggle,
  priceFor,
  vehicleSelected,
}: {
  title: string;
  services: Service[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  priceFor: (s: Service) => string | null;
  vehicleSelected: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="mb-2 text-xs font-semibold uppercase text-slate-400">{title}</div>
      {services.length === 0 && <div className="text-xs text-slate-400">No {title.toLowerCase()} services available.</div>}
      {services.map((s) => {
        const price = priceFor(s);
        const disabled = !price;
        return (
          <label
            key={s.id}
            className={`mb-1 flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-slate-50 ${
              disabled ? "text-slate-400" : ""
            }`}
          >
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected.has(s.id)}
                onChange={() => onToggle(s.id)}
              />
              {s.name}
            </span>
            <span className="text-xs">
              {price ? `$${price}` : vehicleSelected ? "Not offered for this vehicle" : "Select vehicle"}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function AddVehicleForm({
  onAdd,
  onCancel,
}: {
  onAdd: (input: { make: string; model: string; year: number; plateNumber: string; color?: string; vehicleType: VehicleType }) => Promise<void>;
  onCancel: () => void;
}) {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("SEDAN");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onAdd({ make, model, year, plateNumber, vehicleType });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 rounded-md border border-slate-200 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          required
          placeholder="Make"
          value={make}
          onChange={(e) => setMake(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          required
          placeholder="Model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          required
          type="number"
          placeholder="Year"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          required
          placeholder="Plate Number"
          value={plateNumber}
          onChange={(e) => setPlateNumber(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <select
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value as VehicleType)}
          className="col-span-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {VEHICLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Add Vehicle"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
