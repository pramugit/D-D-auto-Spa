import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import * as customersApi from "../api/customers";
import type { Customer, Vehicle, VehicleType } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { Modal } from "../components/Modal";

const VEHICLE_TYPES: VehicleType[] = ["SEDAN", "SUV", "HATCHBACK", "VAN", "PICKUP", "OTHER"];

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddVehicle, setShowAddVehicle] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [c, v] = await Promise.all([customersApi.getCustomer(id), customersApi.listVehicles(id)]);
      setCustomer(c);
      setVehicles(v);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="text-slate-400">Loading...</div>;
  if (error) return <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>;
  if (!customer) return null;

  return (
    <div>
      <Link to="/customers" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Back to Customers
      </Link>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h1 className="text-2xl font-semibold text-slate-800">{customer.name}</h1>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-600 sm:grid-cols-4">
          <div>
            <div className="text-xs uppercase text-slate-400">Phone</div>
            {customer.phone}
          </div>
          <div>
            <div className="text-xs uppercase text-slate-400">Email</div>
            {customer.email ?? "—"}
          </div>
          <div>
            <div className="text-xs uppercase text-slate-400">Address</div>
            {customer.address ?? "—"}
          </div>
          <div>
            <div className="text-xs uppercase text-slate-400">Loyalty Points</div>
            {customer.loyaltyPoints}
          </div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Vehicles</h2>
        <button
          onClick={() => setShowAddVehicle(true)}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          + Add Vehicle
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Plate</th>
              <th className="px-4 py-2">Make / Model</th>
              <th className="px-4 py-2">Year</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Color</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No vehicles yet.
                </td>
              </tr>
            ) : (
              vehicles.map((v) => (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{v.plateNumber}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {v.make} {v.model}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{v.year}</td>
                  <td className="px-4 py-2 text-slate-600">{v.vehicleType}</td>
                  <td className="px-4 py-2 text-slate-600">{v.color ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddVehicle && (
        <AddVehicleModal
          customerId={customer.id}
          onClose={() => setShowAddVehicle(false)}
          onCreated={() => {
            setShowAddVehicle(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddVehicleModal({
  customerId,
  onClose,
  onCreated,
}: {
  customerId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
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
    setSaving(true);
    try {
      await customersApi.createVehicle(customerId, {
        make,
        model,
        year,
        plateNumber,
        color: color || undefined,
        vehicleType,
      });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add Vehicle" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Make</label>
            <input
              required
              value={make}
              onChange={(e) => setMake(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Model</label>
            <input
              required
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Year</label>
            <input
              type="number"
              required
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Plate Number</label>
            <input
              required
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
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
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Add Vehicle"}
        </button>
      </form>
    </Modal>
  );
}
