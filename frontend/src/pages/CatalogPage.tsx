import { formatMinutes, packageMinutes } from "../utils/duration";
import { VEHICLE_TYPES, vehicleTypeLabel } from "../config/vehicleTypes";
import { useEffect, useState, type FormEvent } from "react";
import { formatMoney } from "../utils/money";
import * as catalogApi from "../api/catalog";
import * as damageTypesApi from "../api/damageTypes";
import type { DamageType, Service, ServiceCategory, ServiceCategoryName, ServicePackage, VehicleType } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { Modal } from "../components/Modal";
import { useAuth } from "../hooks/useAuth";
import { canEdit } from "../config/permissions";
import { validatePrice } from "../utils/validators";

const CATEGORY_NAMES: ServiceCategoryName[] = ["EXTERIOR", "INTERIOR"];

type Tab = "services" | "packages" | "damage-types";

export function CatalogPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("services");
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [damageTypes, setDamageTypes] = useState<DamageType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreateService, setShowCreateService] = useState(false);
  const [showCreatePackage, setShowCreatePackage] = useState(false);
  const [showCreateDamageType, setShowCreateDamageType] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingPackage, setEditingPackage] = useState<ServicePackage | null>(null);
  const [editingDamageType, setEditingDamageType] = useState<DamageType | null>(null);
  const canManageDamageTypes = user && canEdit(user.role, "damageTypes");

  async function load() {
    setError(null);
    try {
      const [cats, svcs, pkgs, types] = await Promise.all([
        catalogApi.listCategories(),
        catalogApi.listServices(),
        catalogApi.listPackages(),
        damageTypesApi.listDamageTypes(),
      ]);
      setCategories(cats);
      setServices(svcs);
      setPackages(pkgs);
      setDamageTypes(types);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function ensureCategory(name: ServiceCategoryName) {
    if (categories.some((c) => c.name === name)) return;
    try {
      await catalogApi.createCategory(name);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Service Catalog</h1>
        <div className="flex gap-2">
          {tab === "services" ? (
            <button
              onClick={() => setShowCreateService(true)}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              + New Service
            </button>
          ) : tab === "packages" ? (
            <button
              onClick={() => setShowCreatePackage(true)}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              + New Package
            </button>
          ) : (
            canManageDamageTypes && (
              <button
                onClick={() => setShowCreateDamageType(true)}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                + New Damage Type
              </button>
            )
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-neutral-800">
        {(["services", "packages", "damage-types"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium capitalize ${
              tab === t ? "border-neutral-800 text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t === "damage-types" ? "Damage Types" : t}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}

      {categories.length < 2 && (
        <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
          Missing categories:{" "}
          {CATEGORY_NAMES.filter((n) => !categories.some((c) => c.name === n)).map((n) => (
            <button key={n} onClick={() => ensureCategory(n)} className="ml-1 underline">
              create {n}
            </button>
          ))}
        </div>
      )}

      {tab === "services" ? (
        <div className="grid gap-3">
          {services.length === 0 && <div className="text-neutral-500">No services yet.</div>}
          {services.map((s) => (
            <div key={s.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-white">
                    {s.name} {!s.active && <span className="text-xs text-red-500">(inactive)</span>}
                  </div>
                  <div className="text-xs uppercase text-neutral-500">
                    {s.category?.name} · ⏱ {formatMinutes(s.durationMinutes)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditingService(s)} className="text-xs text-neutral-300 hover:underline">
                    Edit
                  </button>
                  {s.active ? (
                    <button
                      onClick={async () => {
                        await catalogApi.deactivateService(s.id);
                        load();
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        await catalogApi.updateService(s.id, { active: true });
                        load();
                      }}
                      className="text-xs text-red-400 hover:underline"
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>
              {s.description && <p className="mt-2 text-sm text-neutral-300">{s.description}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {s.pricing.map((p) => (
                  <span key={p.id} className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-neutral-300">
                    {vehicleTypeLabel(p.vehicleType)}: {formatMoney(p.price)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : tab === "packages" ? (
        <div className="grid gap-3">
          {packages.length === 0 && <div className="text-neutral-500">No packages yet.</div>}
          {packages.map((p) => (
            <div key={p.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-white">
                    {p.name} {!p.active && <span className="text-xs text-red-500">(inactive)</span>}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {formatMoney(p.discountedPrice)} · ⏱ {formatMinutes(packageMinutes(p))}
                    {p.durationMinutes == null && <span className="text-neutral-600"> (services added up)</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditingPackage(p)} className="text-xs text-neutral-300 hover:underline">
                    Edit
                  </button>
                  {p.active ? (
                    <button
                      onClick={async () => {
                        await catalogApi.deactivatePackage(p.id);
                        load();
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        await catalogApi.updatePackage(p.id, { active: true });
                        load();
                      }}
                      className="text-xs text-red-400 hover:underline"
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>
              {p.description && <p className="mt-2 text-sm text-neutral-300">{p.description}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {p.services.map((link) => (
                  <span key={link.serviceId} className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-neutral-300">
                    {link.service.name} · {formatMinutes(link.service.durationMinutes)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="bg-black text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Default Price</th>
                <th className="px-4 py-2">Repair time</th>
                {canManageDamageTypes && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {damageTypes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    No damage types yet.
                  </td>
                </tr>
              ) : (
                damageTypes.map((t) => (
                  <tr key={t.id} className="border-t border-neutral-800">
                    <td className="px-4 py-2 font-medium text-white">{t.name}</td>
                    <td className="px-4 py-2 text-neutral-300">{t.category}</td>
                    <td className="px-4 py-2 text-neutral-300">{formatMoney(t.defaultPrice)}</td>
                    <td className="px-4 py-2 text-neutral-300">⏱ {formatMinutes(t.repairMinutes)}</td>
                    {canManageDamageTypes && (
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => setEditingDamageType(t)}
                            className="text-xs text-neutral-300 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await damageTypesApi.deleteDamageType(t.id);
                                load();
                              } catch (err) {
                                setError(apiErrorMessage(err));
                              }
                            }}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Delete
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
      )}

      {showCreateService && (
        <CreateServiceModal
          categories={categories}
          onClose={() => setShowCreateService(false)}
          onCreated={() => {
            setShowCreateService(false);
            load();
          }}
        />
      )}
      {showCreatePackage && (
        <CreatePackageModal
          services={services}
          onClose={() => setShowCreatePackage(false)}
          onCreated={() => {
            setShowCreatePackage(false);
            load();
          }}
        />
      )}
      {editingService && (
        <EditServiceModal
          service={editingService}
          categories={categories}
          onClose={() => setEditingService(null)}
          onSaved={() => {
            setEditingService(null);
            load();
          }}
        />
      )}
      {editingPackage && (
        <EditPackageModal
          pkg={editingPackage}
          services={services}
          onClose={() => setEditingPackage(null)}
          onSaved={() => {
            setEditingPackage(null);
            load();
          }}
        />
      )}
      {showCreateDamageType && (
        <DamageTypeModal
          onClose={() => setShowCreateDamageType(false)}
          onSaved={() => {
            setShowCreateDamageType(false);
            load();
          }}
        />
      )}
      {editingDamageType && (
        <DamageTypeModal
          damageType={editingDamageType}
          onClose={() => setEditingDamageType(null)}
          onSaved={() => {
            setEditingDamageType(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function DamageTypeModal({
  damageType,
  onClose,
  onSaved,
}: {
  damageType?: DamageType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(damageType?.name ?? "");
  const [defaultPrice, setDefaultPrice] = useState(damageType?.defaultPrice ?? "");
  const [category, setCategory] = useState<ServiceCategoryName>(damageType?.category ?? "EXTERIOR");
  const [repairMinutes, setRepairMinutes] = useState(String(damageType?.repairMinutes ?? 30));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const priceError = validatePrice(defaultPrice);
    if (priceError) {
      setError(priceError);
      return;
    }
    setSaving(true);
    try {
      const mins = Number(repairMinutes);
      if (!Number.isInteger(mins) || mins < 0) {
        setError("Repair time must be a whole number of minutes");
        setSaving(false);
        return;
      }
      const input = { name: name.trim(), defaultPrice: Number(defaultPrice), repairMinutes: mins, category };
      if (damageType) {
        await damageTypesApi.updateDamageType(damageType.id, input);
      } else {
        await damageTypesApi.createDamageType(input);
      }
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={damageType ? "Edit Damage Type" : "New Damage Type"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dent - Small"
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Default Price</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ServiceCategoryName)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            >
              {CATEGORY_NAMES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Repair time (minutes per marked spot)</label>
          <input
            type="number"
            min={0}
            step={5}
            required
            value={repairMinutes}
            onChange={(e) => setRepairMinutes(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-neutral-500">
            When a repair of this type is offered or approved on a job, this time is added to the job and the booking calendar moves with it.
          </p>
        </div>
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : damageType ? "Save Changes" : "Create Damage Type"}
        </button>
      </form>
    </Modal>
  );
}

function CreateServiceModal({
  categories,
  onClose,
  onCreated,
}: {
  categories: ServiceCategory[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [prices, setPrices] = useState<Record<VehicleType, string>>(
    () => Object.fromEntries(VEHICLE_TYPES.map((t) => [t, ""])) as Record<VehicleType, string>
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const pricing = VEHICLE_TYPES.filter((t) => prices[t] !== "").map((t) => ({
      vehicleType: t,
      price: Number(prices[t]),
    }));
    if (pricing.length === 0) {
      setError("Set a price for at least one vehicle type");
      return;
    }
    if (!categoryId) {
      setError("Select a category (create EXTERIOR/INTERIOR categories first if missing)");
      return;
    }

    setSaving(true);
    try {
      await catalogApi.createService({
        categoryId,
        name,
        description: description || undefined,
        durationMinutes,
        pricing,
      });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Service" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Duration (minutes)</label>
          <input
            type="number"
            required
            min={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-40 rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-300">
            Price by vehicle type (leave blank for not offered)
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {VEHICLE_TYPES.map((t) => (
              <div key={t}>
                <label className="mb-1 block text-xs text-neutral-400">{vehicleTypeLabel(t)}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={prices[t]}
                  onChange={(e) => setPrices((p) => ({ ...p, [t]: e.target.value }))}
                  className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Create Service"}
        </button>
      </form>
    </Modal>
  );
}

function CreatePackageModal({
  services,
  onClose,
  onCreated,
}: {
  services: Service[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountedPrice, setDiscountedPrice] = useState("");
  const [timeMinutes, setTimeMinutes] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError("Select at least one service");
      return;
    }
    setSaving(true);
    try {
      await catalogApi.createPackage({
        name,
        description: description || undefined,
        discountedPrice: Number(discountedPrice),
        durationMinutes: timeMinutes === "" ? null : Number(timeMinutes),
        serviceIds: Array.from(selected),
      });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Service Package" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Discounted Price</label>
            <input
              type="number"
              required
              min={0}
              step="0.01"
              value={discountedPrice}
              onChange={(e) => setDiscountedPrice(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>
        <PackageTimeField
          value={timeMinutes}
          onChange={setTimeMinutes}
          autoMinutes={services.filter((x) => selected.has(x.id)).reduce((t, x) => t + x.durationMinutes, 0)}
        />
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-300">Included services</label>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-neutral-800 p-2">
            {services.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                {s.name} <span className="text-xs text-neutral-500">({s.category?.name} · {formatMinutes(s.durationMinutes)})</span>
              </label>
            ))}
          </div>
        </div>
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Create Package"}
        </button>
      </form>
    </Modal>
  );
}

function EditServiceModal({
  service,
  categories,
  onClose,
  onSaved,
}: {
  service: Service;
  categories: ServiceCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? "");
  const [categoryId, setCategoryId] = useState(service.categoryId);
  const [durationMinutes, setDurationMinutes] = useState(service.durationMinutes);
  const [prices, setPrices] = useState<Record<VehicleType, string>>(() => {
    const initial = Object.fromEntries(VEHICLE_TYPES.map((t) => [t, ""])) as Record<VehicleType, string>;
    for (const p of service.pricing) initial[p.vehicleType] = p.price;
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const pricing = VEHICLE_TYPES.filter((t) => prices[t] !== "").map((t) => ({
      vehicleType: t,
      price: Number(prices[t]),
    }));
    if (pricing.length === 0) {
      setError("Set a price for at least one vehicle type");
      return;
    }

    setSaving(true);
    try {
      await catalogApi.updateService(service.id, {
        categoryId,
        name,
        description: description || undefined,
        durationMinutes,
        pricing,
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit Service" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Duration (minutes)</label>
          <input
            type="number"
            required
            min={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-40 rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-300">
            Price by vehicle type (leave blank for not offered)
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {VEHICLE_TYPES.map((t) => (
              <div key={t}>
                <label className="mb-1 block text-xs text-neutral-400">{vehicleTypeLabel(t)}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={prices[t]}
                  onChange={(e) => setPrices((p) => ({ ...p, [t]: e.target.value }))}
                  className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
                />
              </div>
            ))}
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

function EditPackageModal({
  pkg,
  services,
  onClose,
  onSaved,
}: {
  pkg: ServicePackage;
  services: Service[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(pkg.name);
  const [description, setDescription] = useState(pkg.description ?? "");
  const [discountedPrice, setDiscountedPrice] = useState(pkg.discountedPrice);
  const [timeMinutes, setTimeMinutes] = useState(pkg.durationMinutes != null ? String(pkg.durationMinutes) : "");
  const [selected, setSelected] = useState<Set<string>>(new Set(pkg.services.map((link) => link.serviceId)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError("Select at least one service");
      return;
    }
    setSaving(true);
    try {
      await catalogApi.updatePackage(pkg.id, {
        name,
        description: description || undefined,
        discountedPrice: Number(discountedPrice),
        durationMinutes: timeMinutes === "" ? null : Number(timeMinutes),
        serviceIds: Array.from(selected),
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit Service Package" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Discounted Price</label>
            <input
              type="number"
              required
              min={0}
              step="0.01"
              value={discountedPrice}
              onChange={(e) => setDiscountedPrice(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>
        <PackageTimeField
          value={timeMinutes}
          onChange={setTimeMinutes}
          autoMinutes={services.filter((x) => selected.has(x.id)).reduce((t, x) => t + x.durationMinutes, 0)}
        />
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-300">Included services</label>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-neutral-800 p-2">
            {services.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                {s.name} <span className="text-xs text-neutral-500">({s.category?.name} · {formatMinutes(s.durationMinutes)})</span>
              </label>
            ))}
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

/** Package time: leave empty to use the included services added up. */
function PackageTimeField({ value, onChange, autoMinutes }: { value: string; onChange: (v: string) => void; autoMinutes: number }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-300">Time for the whole package (minutes)</label>
      <input
        type="number"
        min={1}
        step={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Auto: ${formatMinutes(autoMinutes) || "0 min"} (services added up)`}
        className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
      />
      <p className="mt-1 text-xs text-neutral-500">
        Leave empty to use the services added up ({formatMinutes(autoMinutes) || "0 min"}). Set it if doing them together is quicker. Bookings use this time.
      </p>
    </div>
  );
}
