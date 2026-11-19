import { VEHICLE_TYPES, formatMileage, vehicleTypeLabel } from "../../config/vehicleTypes";
import { useEffect, useState, type FormEvent } from "react";
import * as portalApi from "../../api/portal";
import type { PortalCustomer } from "../../api/portal";
import type { Vehicle, VehicleType } from "../../api/types";
import { apiErrorMessage } from "../../api/client";
import { useCustomerAuth } from "../../hooks/useCustomerAuth";
import { NameField, PhoneField, EmailField, PlateNumberField, MileageField, mileageValue } from "../../components/FormFields";


export function PortalProfilePage() {
  const { customer, refreshProfile } = useCustomerAuth();
  const [profile, setProfile] = useState<PortalCustomer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    if (!customer) return;
    setError(null);
    try {
      setProfile(await portalApi.getMyProfile(customer.id));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  if (!profile) return <div className="text-neutral-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">My Profile</h1>
        <p className="mt-1 text-sm text-neutral-400">Update your contact details and manage your vehicles.</p>
      </div>

      {notice && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{notice}</div>}
      {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}

      <ProfileForm
        profile={profile}
        onSaved={(updated) => {
          setProfile(updated);
          refreshProfile({ name: updated.name, email: updated.email ?? undefined });
          setNotice("Profile updated");
          setError(null);
        }}
        onError={(msg) => {
          setError(msg);
          setNotice(null);
        }}
      />

      <VehiclesSection
        customerId={profile.id}
        vehicles={profile.vehicles ?? []}
        onChanged={load}
        onError={(msg) => {
          setError(msg);
          setNotice(null);
        }}
      />

      <ChangePasswordForm
        onSaved={() => {
          setNotice("Password changed");
          setError(null);
        }}
        onError={(msg) => {
          setError(msg);
          setNotice(null);
        }}
      />
    </div>
  );
}

function ProfileForm({
  profile,
  onSaved,
  onError,
}: {
  profile: PortalCustomer;
  onSaved: (updated: PortalCustomer) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [email, setEmail] = useState(profile.email ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await portalApi.updateMyProfile(profile.id, {
        name,
        phone,
        email: email || undefined,
        address: address || undefined,
      });
      onSaved(updated);
    } catch (err) {
      onError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-pop-in space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-sm"
    >
      <h2 className="text-sm font-semibold uppercase text-neutral-400">Contact Details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <NameField label="Name" required value={name} onChange={setName} />
        <PhoneField label="Phone" required value={phone} onChange={setPhone} />
        <EmailField label="Email" value={email} onChange={setEmail} />
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-red-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </form>
  );
}

function VehiclesSection({
  customerId,
  vehicles,
  onChanged,
  onError,
}: {
  customerId: string;
  vehicles: Vehicle[];
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleDelete(vehicleId: string) {
    try {
      await portalApi.removeMyVehicle(customerId, vehicleId);
      onChanged();
    } catch (err) {
      onError(apiErrorMessage(err));
    }
  }

  return (
    <div className="animate-pop-in rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase text-neutral-400">My Vehicles</h2>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm font-medium text-red-500 hover:underline"
          >
            + Add Vehicle
          </button>
        )}
      </div>

      {vehicles.length === 0 && !showAdd && (
        <div className="text-sm text-neutral-500">No vehicles on file yet.</div>
      )}

      <div className="space-y-2">
        {vehicles.map((v) =>
          editingId === v.id ? (
            <VehicleForm
              key={v.id}
              customerId={customerId}
              vehicle={v}
              onDone={() => {
                setEditingId(null);
                onChanged();
              }}
              onCancel={() => setEditingId(null)}
              onError={onError}
            />
          ) : (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-md border border-neutral-800 px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium text-white">{v.plateNumber}</div>
                <div className="text-xs text-neutral-400">
                  {v.make} {v.model} ({v.year}) &middot; {vehicleTypeLabel(v.vehicleType)}
                  {v.mileage != null && <> &middot; {formatMileage(v.mileage)}</>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setEditingId(v.id)} className="text-xs text-red-500 hover:underline">
                  Edit
                </button>
                <button onClick={() => handleDelete(v.id)} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {showAdd && (
        <div className="mt-3">
          <VehicleForm
            customerId={customerId}
            onDone={() => {
              setShowAdd(false);
              onChanged();
            }}
            onCancel={() => setShowAdd(false)}
            onError={onError}
          />
        </div>
      )}
    </div>
  );
}

function VehicleForm({
  customerId,
  vehicle,
  onDone,
  onCancel,
  onError,
}: {
  customerId: string;
  vehicle?: Vehicle;
  onDone: () => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const [make, setMake] = useState(vehicle?.make ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [year, setYear] = useState(vehicle?.year ?? new Date().getFullYear());
  const [plateNumber, setPlateNumber] = useState(vehicle?.plateNumber ?? "");
  const [color, setColor] = useState(vehicle?.color ?? "");
  const [mileage, setMileage] = useState(vehicle?.mileage != null ? String(vehicle.mileage) : "");
  const [vehicleType, setVehicleType] = useState<VehicleType>(vehicle?.vehicleType ?? "SEDAN");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const input = { make, model, year, plateNumber, color: color || undefined, vehicleType, mileage: mileageValue(mileage) ?? null };
      if (vehicle) {
        await portalApi.updateMyVehicle(customerId, vehicle.id, input);
      } else {
        await portalApi.addMyVehicle(customerId, input);
      }
      onDone();
    } catch (err) {
      onError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border border-red-900 bg-red-950/50 p-3">
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
        <input
          placeholder="Color (optional)"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="rounded-md border border-neutral-700 px-2 py-1.5 text-sm"
        />
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
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : vehicle ? "Save Vehicle" : "Add Vehicle"}
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

function ChangePasswordForm({
  onSaved,
  onError,
}: {
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (newPassword !== confirmPassword) {
      setLocalError("New passwords do not match");
      return;
    }
    setSaving(true);
    try {
      await portalApi.changeMyPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onSaved();
    } catch (err) {
      onError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-pop-in space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-sm"
    >
      <h2 className="text-sm font-semibold uppercase text-neutral-400">Change Password</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Current Password</label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">New Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Confirm New Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>
      </div>
      {localError && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{localError}</div>}
      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-red-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Change Password"}
      </button>
    </form>
  );
}
