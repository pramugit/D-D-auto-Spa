import { VEHICLE_TYPES, vehicleTypeLabel } from "../config/vehicleTypes";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as customersApi from "../api/customers";
import type { Customer, VehicleType } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { Modal } from "../components/Modal";
import { EmailField, MileageField, NameField, PhoneField, PlateNumberField, mileageValue } from "../components/FormFields";


export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  async function load(searchTerm?: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await customersApi.listCustomers(searchTerm || undefined);
      setCustomers(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const vehicleCount = customers.reduce((n, c) => n + (c.vehicles?.length ?? 0), 0);
  const points = customers.reduce((n, c) => n + (c.loyaltyPoints ?? 0), 0);

  return (
    <div>
      {/* Red hero band */}
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 via-red-600 to-red-800 px-6 py-7 text-white shadow-lg shadow-red-950/40">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 animate-blob" aria-hidden />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-white/10 animate-blob"
          style={{ animationDelay: "-6s" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-shimmer"
          aria-hidden
        />

        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Customers &amp; Vehicles</p>
            <h1 className="mt-1 text-3xl font-bold">Customers</h1>
            <p className="mt-1 text-sm text-white/80">Everyone who has brought a vehicle to the station.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="group rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-red-700 shadow-md transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
          >
            <span className="mr-1 inline-block transition-transform duration-300 group-hover:rotate-90">+</span> New Customer
          </button>
        </div>

        <div className="relative mt-5 flex flex-wrap gap-3">
          {[
            { label: "Customers", value: customers.length },
            { label: "Vehicles", value: vehicleCount },
            { label: "Loyalty points", value: points },
          ].map((s, idx) => (
            <div key={s.label} className="rounded-xl bg-white/15 px-4 py-2 ring-1 ring-white/20 backdrop-blur-sm">
              <div
                key={`${s.label}-${s.value}`}
                className="text-xl font-bold animate-count-pop"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                {loading && customers.length === 0 ? "…" : s.value.toLocaleString()}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-white/75">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* White content card */}
      <div className="overflow-hidden rounded-2xl bg-neutral-950 shadow-xl shadow-red-950/30 ring-1 ring-red-900/40 animate-pop-in">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-5 py-4">
          <div className="relative w-full max-w-md">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-red-500" aria-hidden>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, or email..."
              aria-label="Search customers"
              className="w-full rounded-full border border-neutral-700 bg-black px-10 py-2 text-sm text-white placeholder:text-neutral-500 transition focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/30"
            />
          </div>
          <span className="text-xs text-neutral-400">
            {loading ? "Searching…" : `${customers.length} customer${customers.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {error && (
          <div className="mx-5 mt-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300 ring-1 ring-red-900">{error}</div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-red-500">
              <tr className="border-b border-neutral-800">
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Vehicles</th>
                <th className="px-5 py-3 text-right">Loyalty</th>
              </tr>
            </thead>
            <tbody>
              {loading && customers.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-neutral-800">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="relative h-3 overflow-hidden rounded-full bg-neutral-800">
                          <div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-red-900/60 to-transparent animate-shimmer" />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-950 text-red-400 animate-pop-in">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                    </div>
                    <div className="font-semibold text-white">No customers found</div>
                    <div className="text-sm text-neutral-400">
                      {search ? "Try a different name, phone or email." : "Add your first customer to get started."}
                    </div>
                  </td>
                </tr>
              ) : (
                customers.map((c, idx) => (
                  <tr
                    key={c.id}
                    className={`group border-b border-neutral-800/80 transition-colors hover:bg-red-950/40 animate-row-in ${
                      justCreated === c.name ? "bg-red-950/50" : ""
                    }`}
                    style={{ animationDelay: `${Math.min(idx, 15) * 35}ms` }}
                  >
                    <td className="relative px-5 py-3 align-top">
                      <span
                        className="absolute inset-y-2 left-0 w-1 origin-center scale-y-0 rounded-r bg-red-600 transition-transform duration-300 group-hover:scale-y-100"
                        aria-hidden
                      />
                      <Link to={`/customers/${c.id}`} className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-700 text-xs font-bold text-white shadow-sm transition-transform duration-300 group-hover:scale-110">
                          {initials(c.name)}
                        </span>
                        <span className="font-semibold text-white transition-colors group-hover:text-red-400">
                          {c.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3 align-top text-neutral-300">{c.phone}</td>
                    <td className="px-5 py-3 align-top text-neutral-400">
                      {c.email ?? <span className="text-neutral-600">—</span>}
                    </td>
                    <td className="px-5 py-3 align-top">
                      {c.vehicles && c.vehicles.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {c.vehicles.map((v) => (
                            <span
                              key={v.id}
                              title={`${v.make} ${v.model} (${vehicleTypeLabel(v.vehicleType)})${v.mileage != null ? ` · ${v.mileage.toLocaleString("en-US")} km` : ""}`}
                              className="whitespace-nowrap rounded-full bg-red-950/70 px-2.5 py-0.5 text-xs font-medium text-red-300 ring-1 ring-red-900 transition hover:bg-red-600 hover:text-white"
                            >
                              {v.plateNumber} · {v.make} {v.model}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-500">No vehicles</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right align-top">
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-neutral-700">
                        <span className="text-red-400" aria-hidden>
                          ★
                        </span>
                        {c.loyaltyPoints}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateCustomerModal
          onClose={() => setShowCreate(false)}
          onCreated={(name) => {
            setShowCreate(false);
            setJustCreated(name);
            load(search);
          }}
        />
      )}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function CreateCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [plateNumber, setPlateNumber] = useState("");
  const [color, setColor] = useState("");
  const [mileage, setMileage] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("SEDAN");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // A customer record with no vehicle on file isn't useful in this shop
    // (every booking/job card hangs off a vehicle) — so the vehicle fields
    // below are mandatory, not an optional add-on.
    if (!make.trim() || !model.trim() || !plateNumber.trim()) {
      setError("Every customer must have at least one vehicle — fill in the vehicle's make, model, and plate number");
      return;
    }
    setSaving(true);
    try {
      const customer = await customersApi.createCustomer({
        name,
        phone,
        email: email || undefined,
        address: address || undefined,
      });
      // Same customer-creation flow, extended: adding the first vehicle
      // right here (instead of a separate trip to the customer detail
      // page) so both are captured in one action, exactly like the
      // customer portal's own booking flow already lets a customer add
      // a vehicle inline.
      await customersApi.createVehicle(customer.id, {
        make,
        model,
        year,
        plateNumber,
        color: color || undefined,
        vehicleType,
        mileage: mileageValue(mileage),
      });
      onCreated(name);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Customer" onClose={onClose} wide accent>
      <form onSubmit={handleSubmit} className="space-y-3">
        <NameField label="Name" required value={name} onChange={setName} />
        <PhoneField label="Phone" required value={phone} onChange={setPhone} />
        <EmailField label="Email (optional)" value={email} onChange={setEmail} />
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Address (optional)</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 border-t border-neutral-800 pt-3 text-sm font-semibold text-neutral-200">
          <input type="checkbox" checked disabled />
          Add a vehicle for this customer now
        </label>

        <div className="space-y-3 rounded-xl border border-red-900/50 bg-black p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NameField label="Make" required value={make} onChange={setMake} />
            <NameField label="Model" required value={model} onChange={setModel} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-300">Year</label>
              <input
                type="number"
                required
                min={1900}
                max={2100}
                step={1}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
              />
            </div>
            <PlateNumberField label="Plate Number" required value={plateNumber} onChange={setPlateNumber} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-300">Color (optional)</label>
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
              />
            </div>
            <MileageField label="Mileage (optional)" value={mileage} onChange={setMileage} />
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-300">Vehicle Type</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
              >
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {vehicleTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300 ring-1 ring-red-900">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-full bg-gradient-to-r from-red-600 to-red-700 px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-600/30 transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
        >
          {saving ? "Saving..." : "Create Customer & Vehicle"}
        </button>
      </form>
    </Modal>
  );
}
