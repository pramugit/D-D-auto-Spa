import { useEffect, useMemo, useState } from "react";
import * as jobCardsApi from "../api/jobCards";
import * as inventoryApi from "../api/inventory";
import { apiErrorMessage } from "../api/client";
import type { InventoryItem, JobCard } from "../api/types";
import { validatePrice } from "../utils/validators";

const fmt = (n: string | number) => String(Number(n));

/**
 * Daily Jobs step 7 — the materials used on the current job.
 *
 * Fully manual: nothing is deducted automatically when the job starts.
 * Each item added here is taken out of stock on the Inventory page (logged in the Inventory page's history,
 * counted in its usage / reorder suggestions). Removing a line puts the
 * stock back. If there isn't enough in stock, the part can be recorded as
 * bought outside instead — its cost goes onto the customer's invoice.
 */
export function DailyJobInventory({
  jobCard,
  canAct,
  onChanged,
}: {
  jobCard: JobCard;
  canAct: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [mode, setMode] = useState<"STOCK" | "EXTERNAL">("STOCK");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [externalName, setExternalName] = useState("");
  const [externalUnitCost, setExternalUnitCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadItems = () =>
    inventoryApi
      .listInventoryItems()
      .then(setItems)
      .catch(() => {});

  useEffect(() => {
    loadItems();
  }, []);

  const usages = jobCard.inventoryUsages ?? [];
  const locked = jobCard.status === "COMPLETED";
  const selected = items.find((i) => i.id === itemId);
  const qty = Number(quantity);
  const qtyValid = Number.isFinite(qty) && qty > 0;
  const exceedsStock = !!selected && qtyValid && qty > Number(selected.quantityInStock);

  const grouped = useMemo(() => {
    const byCat = new Map<string, InventoryItem[]>();
    for (const i of items) {
      const k = i.category || "Other";
      byCat.set(k, [...(byCat.get(k) ?? []), i]);
    }
    return [...byCat.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const materialCost = usages.reduce(
    (sum, u) =>
      sum +
      Number(u.quantityUsed) *
        Number(u.sourceType === "EXTERNAL_PURCHASE" ? u.externalCost ?? 0 : u.item?.costPerUnit ?? 0),
    0
  );

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      setNotice(msg);
      await Promise.all([onChanged(), loadItems()]);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function addFromStock() {
    if (!selected || !qtyValid || exceedsStock) return;
    run(async () => {
      const res = await jobCardsApi.recordInventoryUsage(jobCard.id, selected.id, qty);
      setItemId("");
      setQuantity("1");
      return res.lowStockWarning ?? `${fmt(qty)} ${selected.unit} of ${selected.name} taken out of stock.`;
    });
  }

  function addExternal() {
    const name = externalName.trim();
    if (!name) return setError("Enter the part name");
    const priceErr = validatePrice(externalUnitCost);
    if (priceErr) return setError(`Unit cost: ${priceErr}`);
    if (!qtyValid) return setError("Quantity must be more than 0");
    run(async () => {
      await jobCardsApi.recordExternalInventoryUsage(jobCard.id, name, Number(externalUnitCost), qty);
      setExternalName("");
      setExternalUnitCost("");
      setQuantity("1");
      setMode("STOCK");
      return `${name} recorded as bought outside — added to the customer's invoice.`;
    });
  }

  async function remove(usageId: string, label: string) {
    if (!window.confirm(`Remove ${label} from this job? Stock items go back into stock.`)) return;
    setRemovingId(usageId);
    await run(async () => {
      await jobCardsApi.removeInventoryUsage(jobCard.id, usageId);
      return `${label} removed from the job.`;
    });
    setRemovingId(null);
  }

  function switchToExternal() {
    setExternalName(selected?.name ?? "");
    setMode("EXTERNAL");
  }

  const input = "rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white";
  const tab = (active: boolean) =>
    `rounded-full px-3 py-1 font-medium ${active ? "bg-red-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`;

  return (
    <div className="space-y-4">
      {notice && <div className="rounded-md bg-green-950 px-3 py-2 text-sm text-green-300">{notice}</div>}
      {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{error}</div>}

      {/* What has been used so far */}
      {usages.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nothing recorded yet — add each material used on this job below.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-950 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 text-right font-medium">Cost (Rs.)</th>
                {canAct && !locked && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {usages.map((u) => {
                const external = u.sourceType === "EXTERNAL_PURCHASE";
                const name = external ? u.externalName ?? "External part" : u.item?.name ?? "Deleted item";
                const unit = external ? "" : u.item?.unit ?? "";
                const unitCost = Number(external ? u.externalCost ?? 0 : u.item?.costPerUnit ?? 0);
                return (
                  <tr key={u.id} className="border-t border-neutral-800">
                    <td className="px-3 py-2 text-neutral-100">{name}</td>
                    <td className="px-3 py-2 text-neutral-300">
                      {fmt(u.quantityUsed)} {unit}
                    </td>
                    <td className="px-3 py-2">
                      {external ? (
                        <span className="rounded-full bg-yellow-950 px-2 py-0.5 text-xs text-yellow-300">
                          Bought outside · billed
                        </span>
                      ) : (
                        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">From stock</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-neutral-300">
                      {(Number(u.quantityUsed) * unitCost).toFixed(2)}
                    </td>
                    {canAct && !locked && (
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => remove(u.id, name)}
                          disabled={busy}
                          className="text-xs text-neutral-400 hover:text-red-400 disabled:opacity-50"
                        >
                          {removingId === u.id ? "Removing..." : "Remove"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-800 bg-neutral-950">
                <td colSpan={3} className="px-3 py-2 text-xs uppercase text-neutral-500">
                  Material cost
                </td>
                <td className="px-3 py-2 text-right font-semibold text-white">{materialCost.toFixed(2)}</td>
                {canAct && !locked && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Add more */}
      {canAct && !locked && (
        <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
          <div className="mb-3 flex gap-2 text-xs">
            <button type="button" onClick={() => setMode("STOCK")} className={tab(mode === "STOCK")}>
              From stock
            </button>
            <button type="button" onClick={() => setMode("EXTERNAL")} className={tab(mode === "EXTERNAL")}>
              Bought outside
            </button>
          </div>

          {mode === "STOCK" ? (
            items.length === 0 ? (
              <p className="text-sm text-neutral-500">No inventory items yet — add them on the Inventory page.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={`${input} min-w-0 flex-1`}>
                    <option value="">Select item...</option>
                    {grouped.map(([cat, list]) => (
                      <optgroup key={cat} label={cat}>
                        {list.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name} — {fmt(i.quantityInStock)} {i.unit} left
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    aria-label="Quantity"
                    className={`${input} w-24`}
                  />
                  {selected && <span className="self-center text-xs text-neutral-500">{selected.unit}</span>}
                  <button
                    onClick={addFromStock}
                    disabled={busy || !selected || !qtyValid || exceedsStock}
                    className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy ? "Saving..." : "+ Add"}
                  </button>
                </div>
                {exceedsStock && (
                  <div className="mt-2 rounded-md bg-red-950 px-3 py-2 text-xs text-red-300">
                    Only {fmt(selected!.quantityInStock)} {selected!.unit} of {selected!.name} left.{" "}
                    <button type="button" onClick={switchToExternal} className="font-medium underline">
                      Record it as bought outside instead
                    </button>
                  </div>
                )}
              </>
            )
          ) : (
            <>
              <p className="mb-2 text-xs text-neutral-500">
                For parts bought outside for this job. Not taken from stock — the cost is added to the customer's invoice.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={externalName}
                  onChange={(e) => setExternalName(e.target.value)}
                  placeholder="Part name"
                  className={`${input} min-w-0 flex-1`}
                />
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Qty"
                  aria-label="Quantity"
                  className={`${input} w-20`}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={externalUnitCost}
                  onChange={(e) => setExternalUnitCost(e.target.value)}
                  placeholder="Unit cost (Rs.)"
                  aria-label="Unit cost"
                  className={`${input} w-36`}
                />
                <button
                  onClick={addExternal}
                  disabled={busy}
                  className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? "Saving..." : "+ Add"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {locked && <p className="text-xs text-neutral-500">The job is completed — materials can no longer be changed.</p>}
    </div>
  );
}
