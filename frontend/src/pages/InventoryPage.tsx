import { useEffect, useState, type FormEvent } from "react";
import * as inventoryApi from "../api/inventory";
import type { InventoryItem } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { Modal } from "../components/Modal";
import { useAuth } from "../hooks/useAuth";

export function InventoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const canManage = user && ["ADMIN", "MANAGER"].includes(user.role);

  async function load() {
    setError(null);
    try {
      setItems(await inventoryApi.listInventoryItems());
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Inventory</h1>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            + New Item
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2">In Stock</th>
              <th className="px-4 py-2">Reorder Level</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No inventory items yet.
                </td>
              </tr>
            ) : (
              items.map((i) => {
                const low = Number(i.quantityInStock) <= Number(i.reorderLevel);
                return (
                  <tr key={i.id} className={`border-t border-slate-100 ${low ? "bg-red-50" : ""}`}>
                    <td className="px-4 py-2 font-medium text-slate-800">{i.name}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {i.quantityInStock} {i.unit}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {i.reorderLevel} {i.unit}
                    </td>
                    <td className="px-4 py-2">
                      {low ? (
                        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                          Low Stock
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateItemModal
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

function CreateItemModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [quantityInStock, setQuantityInStock] = useState(0);
  const [reorderLevel, setReorderLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await inventoryApi.createInventoryItem({ name, unit, quantityInStock, reorderLevel });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Inventory Item" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
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
          <label className="mb-1 block text-sm font-medium text-slate-600">Unit (e.g. bottle, liter)</label>
          <input
            required
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Quantity In Stock</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={quantityInStock}
              onChange={(e) => setQuantityInStock(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Reorder Level</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Create Item"}
        </button>
      </form>
    </Modal>
  );
}
