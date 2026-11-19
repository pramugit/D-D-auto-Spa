import { VEHICLE_TYPES, formatMileage, vehicleTypeLabel } from "../config/vehicleTypes";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as customersApi from "../api/customers";
import type { Customer, Vehicle, VehicleType } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { Modal } from "../components/Modal";
import { useAuth } from "../hooks/useAuth";
import { canEdit } from "../config/permissions";
import { EmailField, MileageField, NameField, PhoneField, PlateNumberField, mileageValue } from "../components/FormFields";


export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [deletingVehicleId, setDeletingVehicleId] = useState<string | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState(false);
  const canManage = user && canEdit(user.role, "customersVehicles");
  // Deleting a customer is ADMIN-only on the backend (customerRoutes.ts),
  // a stricter check than the customersVehicles.edit permission.
  const canDeleteCustomer = user?.role === "ADMIN";

  async function handleDeleteVehicle(vehicle: Vehicle) {
    if (!id) return;
    if (!confirm(`Remove vehicle ${vehicle.plateNumber} (${vehicle.make} ${vehicle.model})? This can't be undone.`)) return;
    setError(null);
    setDeletingVehicleId(vehicle.id);
    try {
      await customersApi.deleteVehicle(id, vehicle.id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setDeletingVehicleId(null);
    }
  }

  async function handleDeleteCustomer() {
    if (!customer) return;
    if (!confirm(`Delete customer "${customer.name}"? This can't be undone.`)) return;
    setError(null);
    setDeletingCustomer(true);
    try {
      await customersApi.deleteCustomer(customer.id);
      navigate("/customers");
    } catch (err) {
      setError(apiErrorMessage(err));
      setDeletingCustomer(false);
    }
  }

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

  if (loading) return <div className="text-neutral-500">Loading...</div>;
  if (error) return <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>;
  if (!customer) return null;

  return (
    <div>
      <Link to="/customers" className="mb-4 inline-block text-sm text-neutral-400 hover:underline">
        ← Back to Customers
      </Link>

      <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">{customer.name}</h1>
          <div className="flex items-center gap-2">
            {canManage && (
              <button
                onClick={() => setShowEditCustomer(true)}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-black"
              >
                Edit
              </button>
            )}
            {canDeleteCustomer && (
              <button
                onClick={handleDeleteCustomer}
                disabled={deletingCustomer}
                className="rounded-md border border-red-900 px-3 py-1.5 text-sm text-red-500 hover:bg-red-950 disabled:opacity-50"
              >
                {deletingCustomer ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-neutral-300 sm:grid-cols-4">
          <div>
            <div className="text-xs uppercase text-neutral-500">Phone</div>
            {customer.phone}
          </div>
          <div>
            <div className="text-xs uppercase text-neutral-500">Email</div>
            {customer.email ?? "—"}
          </div>
          <div>
            <div className="text-xs uppercase text-neutral-500">Address</div>
            {customer.address ?? "—"}
          </div>
          <div>
            {/* Read-only, system-tracked: accumulates from paid invoices
                (see invoiceService.reconcileInvoiceStatus). Never an
                editable input, on this page or the create form. */}
            <div className="text-xs uppercase text-neutral-500">Loyalty Points</div>
            {customer.loyaltyPoints}
          </div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Vehicles</h2>
        {canManage && (
          <button
            onClick={() => setShowAddVehicle(true)}
            className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Add Vehicle
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-black text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Plate</th>
              <th className="px-4 py-2">Make / Model</th>
              <th className="px-4 py-2">Year</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Color</th>
              <th className="px-4 py-2">Mileage</th>
              {canManage && <th className="px-4 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {vehicles.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-4 py-6 text-center text-neutral-500">
                  No vehicles yet.
                </td>
              </tr>
            ) : (
              vehicles.map((v) => (
                <tr key={v.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2 font-medium text-white">{v.plateNumber}</td>
                  <td className="px-4 py-2 text-neutral-300">
                    {v.make} {v.model}
                  </td>
                  <td className="px-4 py-2 text-neutral-300">{v.year}</td>
                  <td className="px-4 py-2 text-neutral-300">{vehicleTypeLabel(v.vehicleType)}</td>
                  <td className="px-4 py-2 text-neutral-300">{v.color ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-300">{formatMileage(v.mileage) || "—"}</td>
                  {canManage && (
                    <td className="px-4 py-2">
                      <div className="flex gap-3">
                        <button onClick={() => setEditVehicle(v)} className="font-medium text-neutral-300 hover:underline">
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteVehicle(v)}
                          disabled={deletingVehicleId === v.id}
                          className="font-medium text-red-500 hover:underline disabled:opacity-50"
                        >
                          {deletingVehicleId === v.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  )}
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

      {showEditCustomer && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setShowEditCustomer(false)}
          onSaved={() => {
            setShowEditCustomer(false);
            load();
          }}
        />
      )}

      {editVehicle && id && (
        <EditVehicleModal
          customerId={id}
          vehicle={editVehicle}
          onClose={() => setEditVehicle(null)}
          onSaved={() => {
            setEditVehicle(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function EditCustomerModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [email, setEmail] = useState(customer.email ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await customersApi.updateCustomer(customer.id, {
        name,
        phone,
        email: email || undefined,
        address: address || undefined,
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit Customer" onClose={onClose}>
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
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </Modal>
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
  const [mileage, setMileage] = useState("");
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
        mileage: mileageValue(mileage),
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
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Add Vehicle"}
        </button>
      </form>
    </Modal>
  );
}

function EditVehicleModal({
  customerId,
  vehicle,
  onClose,
  onSaved,
}: {
  customerId: string;
  vehicle: Vehicle;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [make, setMake] = useState(vehicle.make);
  const [model, setModel] = useState(vehicle.model);
  const [year, setYear] = useState(vehicle.year);
  const [plateNumber, setPlateNumber] = useState(vehicle.plateNumber);
  const [color, setColor] = useState(vehicle.color ?? "");
  const [mileage, setMileage] = useState(vehicle.mileage != null ? String(vehicle.mileage) : "");
  const [vehicleType, setVehicleType] = useState<VehicleType>(vehicle.vehicleType);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await customersApi.updateVehicle(customerId, vehicle.id, {
        make,
        model,
        year,
        plateNumber,
        color: color || undefined,
        vehicleType,
        mileage: mileageValue(mileage) ?? null,
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit Vehicle" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
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
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </Modal>
  );
}
