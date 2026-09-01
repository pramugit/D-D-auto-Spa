import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as customersApi from "../api/customers";
import type { Customer, VehicleType } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { Modal } from "../components/Modal";
import { EmailField, NameField, PhoneField, PlateNumberField } from "../components/FormFields";

const VEHICLE_TYPES: VehicleType[] = ["SEDAN", "SUV", "HATCHBACK", "VAN", "PICKUP", "OTHER"];

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Customers</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          + New Customer
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, phone, or email..."
        className="mb-4 w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Vehicles</th>
              <th className="px-4 py-2">Loyalty Points</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No customers found.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 align-top">
                    <Link to={`/customers/${c.id}`} className="font-medium text-slate-800 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 align-top text-slate-600">{c.phone}</td>
                  <td className="px-4 py-2 align-top text-slate-600">{c.email ?? "—"}</td>
                  <td className="px-4 py-2 align-top text-slate-600">
                    {c.vehicles && c.vehicles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.vehicles.map((v) => (
                          <span
                            key={v.id}
                            title={`${v.make} ${v.model} (${v.vehicleType})`}
                            className="whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                          >
                            {v.plateNumber} — {v.make} {v.model}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400">No vehicles</span>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top text-slate-600">{c.loyaltyPoints}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateCustomerModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load(search);
          }}
        />
      )}
    </div>
  );
}

function CreateCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [addVehicle, setAddVehicle] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [plateNumber, setPlateNumber] = useState("");
  const [color, setColor] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("SEDAN");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (addVehicle && (!make.trim() || !model.trim() || !plateNumber.trim())) {
      setError("Fill in the vehicle's make, model, and plate number, or uncheck \"Add a vehicle now\"");
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
      if (addVehicle) {
        await customersApi.createVehicle(customer.id, {
          make,
          model,
          year,
          plateNumber,
          color: color || undefined,
          vehicleType,
        });
      }
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Customer" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-3">
        <NameField label="Name" required value={name} onChange={setName} />
        <PhoneField label="Phone" required value={phone} onChange={setPhone} />
        <EmailField label="Email (optional)" value={email} onChange={setEmail} />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Address (optional)</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={addVehicle} onChange={(e) => setAddVehicle(e.target.checked)} />
          Add a vehicle for this customer now
        </label>

        {addVehicle && (
          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-2 gap-3">
              <NameField label="Make" required value={make} onChange={setMake} />
              <NameField label="Model" required value={model} onChange={setModel} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Year</label>
                <input
                  type="number"
                  required
                  min={1900}
                  max={2100}
                  step={1}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <PlateNumberField label="Plate Number" required value={plateNumber} onChange={setPlateNumber} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Color (optional)</label>
                <input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Vehicle Type</label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : addVehicle ? "Create Customer & Vehicle" : "Create Customer"}
        </button>
      </form>
    </Modal>
  );
}
