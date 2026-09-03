import { useEffect, useState, type FormEvent } from "react";
import * as catalogApi from "../api/catalog";
import type { Service, ServiceCategory, ServiceCategoryName, ServicePackage, VehicleType } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { Modal } from "../components/Modal";

const VEHICLE_TYPES: VehicleType[] = ["SEDAN", "SUV", "HATCHBACK", "VAN", "PICKUP", "OTHER"];
const CATEGORY_NAMES: ServiceCategoryName[] = ["EXTERIOR", "INTERIOR"];

type Tab = "services" | "packages";

export function CatalogPage() {
  const [tab, setTab] = useState<Tab>("services");
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreateService, setShowCreateService] = useState(false);
  const [showCreatePackage, setShowCreatePackage] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingPackage, setEditingPackage] = useState<ServicePackage | null>(null);

  async function load() {
    setError(null);
    try {
      const [cats, svcs, pkgs] = await Promise.all([
        catalogApi.listCategories(),
        catalogApi.listServices(),
        catalogApi.listPackages(),
      ]);
      setCategories(cats);
      setServices(svcs);
      setPackages(pkgs);
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
        <h1 className="text-2xl font-semibold text-slate-800">Service Catalog</h1>
        <div className="flex gap-2">
          {tab === "services" ? (
            <button
              onClick={() => setShowCreateService(true)}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              + New Service
            </button>
          ) : (
            <button
              onClick={() => setShowCreatePackage(true)}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              + New Package
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(["services", "packages"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium capitalize ${
              tab === t ? "border-slate-800 text-slate-800" : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      {categories.length < 2 && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
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
          {services.length === 0 && <div className="text-slate-400">No services yet.</div>}
          {services.map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-800">
                    {s.name} {!s.active && <span className="text-xs text-red-500">(inactive)</span>}
                  </div>
                  <div className="text-xs uppercase text-slate-400">
                    {s.category?.name} · {s.durationMinutes} min
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditingService(s)} className="text-xs text-slate-600 hover:underline">
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
                      className="text-xs text-green-600 hover:underline"
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>
              {s.description && <p className="mt-2 text-sm text-slate-600">{s.description}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {s.pricing.map((p) => (
                  <span key={p.id} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    {p.vehicleType}: ${p.price}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {packages.length === 0 && <div className="text-slate-400">No packages yet.</div>}
          {packages.map((p) => (
            <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-800">
                    {p.name} {!p.active && <span className="text-xs text-red-500">(inactive)</span>}
                  </div>
                  <div className="text-xs text-slate-400">${p.discountedPrice}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditingPackage(p)} className="text-xs text-slate-600 hover:underline">
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
                      className="text-xs text-green-600 hover:underline"
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>
              {p.description && <p className="mt-2 text-sm text-slate-600">{p.description}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {p.services.map((link) => (
                  <span key={link.serviceId} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    {link.service.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
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
    </div>
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
  const [prices, setPrices] = useState<Record<VehicleType, string>>({
    SEDAN: "",
    SUV: "",
    HATCHBACK: "",
    VAN: "",
    PICKUP: "",
    OTHER: "",
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
          <label className="mb-1 block text-sm font-medium text-slate-600">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Duration (minutes)</label>
          <input
            type="number"
            required
            min={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600">
            Price by vehicle type (leave blank for not offered)
          </label>
          <div className="grid grid-cols-3 gap-3">
            {VEHICLE_TYPES.map((t) => (
              <div key={t}>
                <label className="mb-1 block text-xs text-slate-500">{t}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={prices[t]}
                  onChange={(e) => setPrices((p) => ({ ...p, [t]: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Discounted Price</label>
            <input
              type="number"
              required
              min={0}
              step="0.01"
              value={discountedPrice}
              onChange={(e) => setDiscountedPrice(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600">Included services</label>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
            {services.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                {s.name} <span className="text-xs text-slate-400">({s.category?.name})</span>
              </label>
            ))}
          </div>
        </div>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
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
    const initial: Record<VehicleType, string> = {
      SEDAN: "",
      SUV: "",
      HATCHBACK: "",
      VAN: "",
      PICKUP: "",
      OTHER: "",
    };
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
          <label className="mb-1 block text-sm font-medium text-slate-600">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Duration (minutes)</label>
          <input
            type="number"
            required
            min={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600">
            Price by vehicle type (leave blank for not offered)
          </label>
          <div className="grid grid-cols-3 gap-3">
            {VEHICLE_TYPES.map((t) => (
              <div key={t}>
                <label className="mb-1 block text-xs text-slate-500">{t}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={prices[t]}
                  onChange={(e) => setPrices((p) => ({ ...p, [t]: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Discounted Price</label>
            <input
              type="number"
              required
              min={0}
              step="0.01"
              value={discountedPrice}
              onChange={(e) => setDiscountedPrice(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600">Included services</label>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
            {services.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                {s.name} <span className="text-xs text-slate-400">({s.category?.name})</span>
              </label>
            ))}
          </div>
        </div>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </Modal>
  );
}
