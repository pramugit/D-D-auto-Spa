import { packageMinutes as packageTime } from "../../utils/duration";
import { VEHICLE_TYPES, vehicleTypeLabel } from "../../config/vehicleTypes";
import { useEffect, useState, type FormEvent } from "react";
import { formatMoney } from "../../utils/money";
import { useNavigate } from "react-router-dom";
import * as portalApi from "../../api/portal";
import type { Service, ServicePackage, Vehicle, VehicleType } from "../../api/types";
import { apiErrorMessage } from "../../api/client";
import { useCustomerAuth } from "../../hooks/useCustomerAuth";
import { MileageField, NameField, PlateNumberField, mileageValue } from "../../components/FormFields";
import { BookingRequestFields, type RequestDetails } from "../../components/BookingRequestFields";
import { formatMinutes } from "../../utils/duration";
import type { ScheduleSettings } from "../../api/types";


export function PortalBookPage() {
  const { customer } = useCustomerAuth();
  const navigate = useNavigate();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [showAddVehicle, setShowAddVehicle] = useState(false);

  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
  const [rules, setRules] = useState<ScheduleSettings | null>(null);
  const [details, setDetails] = useState<RequestDetails>({
    preferredFrom: "",
    preferredTo: "",
    preferredTime: "ANY",
    contactVia: "WHATSAPP",
    contactPhone: "",
    contactEmail: "",
    message: "",
  });

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
    portalApi.listActivePackages().then(setPackages).catch((err) => setError(apiErrorMessage(err)));
    portalApi.getScheduleRules().then(setRules).catch(() => {});
    // Pre-fill how to reach them from their account.
    if (customer)
      portalApi
        .getMyProfile(customer.id)
        .then((me) => setDetails((d) => ({ ...d, contactPhone: d.contactPhone || me.phone || "", contactEmail: d.contactEmail || me.email || "" })))
        .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  // Services already covered by a selected package aren't offered as a
  // separate line item too — that would double-book and double-charge them.
  const packageServiceIds = new Set(
    Array.from(selectedPackages).flatMap((id) => {
      const pkg = packages.find((p) => p.id === id);
      return pkg ? pkg.services.map((link) => link.serviceId) : [];
    }),
  );

  const serviceMinutes = Array.from(selectedServices).reduce((sum, id) => {
    const svc = services.find((s) => s.id === id);
    return sum + (svc?.durationMinutes ?? 0);
  }, 0);
  const packageMinutes = Array.from(selectedPackages).reduce((sum, id) => {
    const pkg = packages.find((p) => p.id === id);
    return sum + (pkg ? packageTime(pkg) : 0);
  }, 0);
  const durationMinutes = serviceMinutes + packageMinutes;


  function toggleService(id: string) {
    if (packageServiceIds.has(id)) return;
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePackage(id: string) {
    setSelectedPackages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        const pkg = packages.find((p) => p.id === id);
        if (pkg) {
          setSelectedServices((svcPrev) => {
            const svcNext = new Set(svcPrev);
            pkg.services.forEach((link) => svcNext.delete(link.serviceId));
            return svcNext;
          });
        }
      }
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

  const serviceTotal = Array.from(selectedServices).reduce((sum, id) => {
    const svc = services.find((s) => s.id === id);
    const price = svc ? priceFor(svc) : null;
    return sum + (price ? Number(price) : 0);
  }, 0);
  const packageTotal = Array.from(selectedPackages).reduce((sum, id) => {
    const pkg = packages.find((p) => p.id === id);
    return sum + (pkg ? Number(pkg.discountedPrice) : 0);
  }, 0);
  const total = serviceTotal + packageTotal;

  async function handleConfirm() {
    setError(null);
    if (!vehicleId) {
      setError("Select or add a vehicle");
      return;
    }
    if (selectedServices.size === 0 && selectedPackages.size === 0) {
      setError("Select at least one service or package");
      return;
    }
    if (!details.preferredFrom || !details.preferredTo) {
      setError("Choose the days that suit you");
      return;
    }
    if (details.contactVia !== "EMAIL" && !details.contactPhone.trim()) {
      setError("Enter your WhatsApp number");
      return;
    }
    if (details.contactVia !== "WHATSAPP" && !details.contactEmail.trim()) {
      setError("Enter your email address");
      return;
    }
    setSubmitting(true);
    try {
      const booking = await portalApi.requestBooking({
        vehicleId,
        items: [
          ...Array.from(selectedServices).map((id) => ({ serviceId: id })),
          ...Array.from(selectedPackages).map((id) => ({ packageId: id })),
        ],
        preferredFrom: details.preferredFrom,
        preferredTo: details.preferredTo,
        preferredTime: details.preferredTime,
        message: details.message.trim() || undefined,
        contactPhone: details.contactVia !== "EMAIL" ? details.contactPhone.trim() : undefined,
        contactEmail: details.contactVia !== "WHATSAPP" ? details.contactEmail.trim() : undefined,
        contactVia: details.contactVia,
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
      <h1 className="mb-1 text-2xl font-bold text-white">Book a Service</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Choose your vehicle and services, tell us which days suit you — we'll send you the exact time on WhatsApp or email to confirm.
      </p>
      {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">1. Vehicle</h2>
        {vehicles.length === 0 && !showAddVehicle && (
          <div className="mb-3 text-sm text-neutral-400">You don't have any vehicles on file yet.</div>
        )}
        {vehicles.length > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => setVehicleId(v.id)}
                className={`rounded-md border px-3 py-2 text-left text-sm ${
                  vehicleId === v.id ? "border-neutral-800 bg-black" : "border-neutral-800 hover:bg-black"
                }`}
              >
                <div className="font-medium text-white">{v.plateNumber}</div>
                <div className="text-xs text-neutral-400">
                  {v.make} {v.model} ({vehicleTypeLabel(v.vehicleType)})
                </div>
              </button>
            ))}
          </div>
        )}
        {!showAddVehicle ? (
          <button onClick={() => setShowAddVehicle(true)} className="text-sm text-neutral-300 hover:underline">
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

      <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">2. Services</h2>
        {!selectedVehicle && (
          <div className="mb-3 text-sm text-neutral-500">Select a vehicle above to see pricing for your vehicle.</div>
        )}

        {packages.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 text-xs font-semibold uppercase text-neutral-500">Bundled packages</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {packages.map((p) => (
                <label
                  key={p.id}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                    selectedPackages.has(p.id) ? "border-red-500 bg-red-950" : "border-neutral-800 hover:bg-black"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPackages.has(p.id)}
                    onChange={() => togglePackage(p.id)}
                    className="mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-white">{p.name}</span>
                      <span className="shrink-0 text-xs font-semibold text-red-500">{formatMoney(p.discountedPrice)}</span>
                    </span>
                    {p.description && <span className="mt-0.5 block text-xs text-neutral-400">{p.description}</span>}
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      Includes: {p.services.map((link) => link.service.name).join(", ")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {services.length === 0 ? (
          <div className="text-sm text-neutral-500">No services are available to book right now.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <ServiceGroup
              title="Exterior"
              services={exteriorServices}
              selected={selectedServices}
              onToggle={toggleService}
              priceFor={priceFor}
              vehicleSelected={!!selectedVehicle}
              packageServiceIds={packageServiceIds}
            />
            <ServiceGroup
              title="Interior"
              services={interiorServices}
              selected={selectedServices}
              onToggle={toggleService}
              priceFor={priceFor}
              vehicleSelected={!!selectedVehicle}
              packageServiceIds={packageServiceIds}
            />
          </div>
        )}
        {(selectedServices.size > 0 || selectedPackages.size > 0) && (
          <div className="mt-4 text-right text-sm font-semibold text-white">
            Estimated total: {formatMoney(total)}
            {durationMinutes > 0 && <span className="ml-2 font-normal text-neutral-400">· takes about {formatMinutes(durationMinutes)}</span>}
          </div>
        )}
      </div>

      <BookingRequestFields value={details} onChange={setDetails} rules={rules} />

      <button
        onClick={handleConfirm}
        disabled={submitting}
        className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-red-700 disabled:opacity-50"
      >
        {submitting ? "Sending..." : "Send booking request"}
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
  packageServiceIds,
}: {
  title: string;
  services: Service[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  priceFor: (s: Service) => string | null;
  vehicleSelected: boolean;
  packageServiceIds: Set<string>;
}) {
  return (
    <div className="rounded-md border border-neutral-800 p-3">
      <div className="mb-2 text-xs font-semibold uppercase text-neutral-500">{title}</div>
      {services.length === 0 && <div className="text-xs text-neutral-500">No {title.toLowerCase()} services available.</div>}
      {services.map((s) => {
        const includedInPackage = packageServiceIds.has(s.id);
        const price = priceFor(s);
        const disabled = !price || includedInPackage;
        return (
          <label
            key={s.id}
            className={`mb-1 flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-black ${
              disabled ? "text-neutral-500" : ""
            }`}
          >
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={includedInPackage || selected.has(s.id)}
                onChange={() => onToggle(s.id)}
              />
              {s.name}
            </span>
            <span className="text-xs">
              {includedInPackage
                ? "Included in package"
                : price
                  ? `Rs. ${price}`
                  : vehicleSelected
                    ? "Not offered for this vehicle"
                    : "Select vehicle"}
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
  onAdd: (input: { make: string; model: string; year: number; plateNumber: string; color?: string; vehicleType: VehicleType; mileage?: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("SEDAN");
  const [mileage, setMileage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onAdd({ make, model, year, plateNumber, vehicleType, mileage: mileageValue(mileage) });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 rounded-md border border-neutral-800 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <NameField required value={make} onChange={setMake} placeholder="Make" />
        <NameField required value={model} onChange={setModel} placeholder="Model" />
        <input
          required
          type="number"
          min={1900}
          max={2100}
          step={1}
          placeholder="Year"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-md border border-neutral-700 px-2 py-1.5 text-sm"
        />
        <PlateNumberField required value={plateNumber} onChange={setPlateNumber} placeholder="Plate Number" />
        <select
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value as VehicleType)}
          className="rounded-md border border-neutral-700 px-2 py-1.5 text-sm"
        >
          {VEHICLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {vehicleTypeLabel(t)}
            </option>
          ))}
        </select>
        <MileageField value={mileage} onChange={setMileage} placeholder="Mileage (optional)" className="w-full rounded-md border border-neutral-700 px-2 py-1.5 text-sm" />
      </div>
      {error && <div className="rounded-md bg-red-950 px-2 py-1 text-xs text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Add Vehicle"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-black"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
