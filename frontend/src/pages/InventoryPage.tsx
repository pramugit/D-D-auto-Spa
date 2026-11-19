import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import * as inventoryApi from "../api/inventory";
import type { InventoryOverview, InventoryOverviewItem, ServiceRecipe, StockMovement, StockStatus } from "../api/inventory";
import { apiErrorMessage } from "../api/client";
import { Modal } from "../components/Modal";
import { InventoryUnlockGate } from "../components/InventoryUnlockGate";
import { InventoryImportModal } from "../components/InventoryImportModal";
import { useAuth } from "../hooks/useAuth";
import { canEdit } from "../config/permissions";

export function InventoryPage() {
  return (
    <InventoryUnlockGate>
      <InventoryPageContent />
    </InventoryUnlockGate>
  );
}

type Tab = "stock" | "reorder" | "recipes" | "history";

const money = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const qty = (n: number | string) => {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "");
};

const STATUS: Record<StockStatus, { label: string; icon: string; cls: string }> = {
  OK: { label: "OK", icon: "✓", cls: "bg-green-950 text-green-400" },
  LOW: { label: "Low", icon: "▲", cls: "bg-yellow-950 text-yellow-400" },
  OUT: { label: "Out", icon: "✕", cls: "bg-red-950 text-red-400" },
  RECOUNT: { label: "Recount", icon: "!", cls: "bg-red-950 text-red-300" },
};

/**
 * Inventory:
 *  - Materials used on a job are recorded by hand (Daily Jobs step 7 / job
 *    card "Inventory Used"), each one taken out of stock as it's recorded.
 *    Service recipes are only a reference of typical amounts.
 *  - Every stock change (received / used on a job / counted) is a logged
 *    movement with its balance — the History tab.
 *  - The Reorder tab is built automatically from stock vs. reorder level and
 *    the last 30 days' usage, with a one-tap WhatsApp order per supplier.
 */
function InventoryPageContent() {
  const { user } = useAuth();
  const canManage = !!user && canEdit(user.role, "inventory");
  const [tab, setTab] = useState<Tab>("stock");
  const [data, setData] = useState<InventoryOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<
    | { kind: "create" }
    | { kind: "edit"; item: InventoryOverviewItem }
    | { kind: "receive"; item: InventoryOverviewItem; quantity?: number }
    | { kind: "count"; item: InventoryOverviewItem }
    | { kind: "import" }
    | null
  >(null);
  const [historyItemId, setHistoryItemId] = useState<string>("");
  const [installing, setInstalling] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await inventoryApi.getInventoryOverview());
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(item: InventoryOverviewItem) {
    if (!confirm(`Remove "${item.name}" from inventory? This can't be undone.`)) return;
    setError(null);
    try {
      await inventoryApi.deleteInventoryItem(item.id);
      setNotice(`${item.name} removed`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function starterKit() {
    setInstalling(true);
    setError(null);
    try {
      const r = await inventoryApi.installStarterKit();
      setNotice(
        `Starter kit added: ${r.itemsAdded} item(s) and ${r.recipesAdded} service recipe(s). Use “Receive” to enter the stock you have and what it cost.`
      );
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setInstalling(false);
    }
  }

  const done = (msg: string) => {
    setModal(null);
    setNotice(msg);
    load();
  };

  const reorderCount = data ? data.items.filter((i) => i.status !== "OK").length : 0;
  const recountItems = data ? data.items.filter((i) => i.status === "RECOUNT") : [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Inventory</h1>
          <p className="text-sm text-neutral-400">
            Materials used on each job are recorded by hand in Daily Jobs (step 7) and taken out of stock as they're recorded.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => setModal({ kind: "import" })}
              className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              title="Add items from CSV, Excel, PDF or a photo of a bill"
            >
              ⇪ Import (CSV · Excel · PDF · Photo)
            </button>
            <button
              onClick={() => setModal({ kind: "create" })}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              + New item
            </button>
          </div>
        )}
      </div>

      {notice && <div className="mb-4 rounded-md bg-green-950 px-3 py-2 text-sm text-green-300">{notice}</div>}
      {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-500">{error}</div>}

      {data && canManage && data.items.length < 5 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900 bg-red-950/30 p-4">
          <div className="text-sm text-neutral-200">
            <div className="font-semibold text-white">Quick start</div>
            Add 15 common car-care supplies (shampoo, wax, coating, cloths...) and ready-made recipes for your services.
            Amounts are starting points — edit anything later.
          </div>
          <button
            onClick={starterKit}
            disabled={installing}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {installing ? "Adding..." : "Add starter kit"}
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Alerts */}
          {recountItems.length > 0 && (
            <div className="mb-4 space-y-2">
              {recountItems.length > 0 && (
                <div className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  ! Stock went below zero for {recountItems.map((i) => i.name).join(", ")} — more was used than recorded.
                  Receive the stock you bought, or do a stock count.
                </div>
              )}
            </div>
          )}

          {/* KPIs */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Items" value={String(data.totals.items)} />
            <Kpi label="Stock value" value={money(data.totals.stockValue)} />
            <Kpi label="Low stock" value={String(data.totals.low)} tone={data.totals.low ? "warn" : undefined} />
            <Kpi label="Out / recount" value={String(data.totals.out)} tone={data.totals.out ? "bad" : undefined} />
            <Kpi label="Used last 30 days" value={money(data.totals.usedCost30)} />
          </div>

          {/* Tabs */}
          <div className="mb-4 flex flex-wrap gap-1 border-b border-neutral-800">
            {(
              [
                ["stock", "Stock"],
                ["reorder", `Reorder${reorderCount ? ` (${reorderCount})` : ""}`],
                ["recipes", "Service recipes"],
                ["history", "History"],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                  tab === k ? "border-red-600 text-white" : "border-transparent text-neutral-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "stock" && (
            <StockTab
              items={data.items}
              canManage={canManage}
              onReceive={(item) => setModal({ kind: "receive", item })}
              onCount={(item) => setModal({ kind: "count", item })}
              onEdit={(item) => setModal({ kind: "edit", item })}
              onHistory={(item) => {
                setHistoryItemId(item.id);
                setTab("history");
              }}
              onDelete={handleDelete}
            />
          )}
          {tab === "reorder" && (
            <ReorderTab
              items={data.items.filter((i) => i.status !== "OK")}
              canManage={canManage}
              onReceive={(item, quantity) => setModal({ kind: "receive", item, quantity })}
            />
          )}
          {tab === "recipes" && <RecipesTab items={data.items} canManage={canManage} onSaved={load} />}
          {tab === "history" && (
            <HistoryTab items={data.items} itemId={historyItemId} onItemChange={setHistoryItemId} />
          )}
        </>
      )}

      {modal?.kind === "create" && (
        <ItemModal
          categories={[...new Set((data?.items ?? []).map((i) => i.category).filter(Boolean) as string[])]}
          onClose={() => setModal(null)}
          onSaved={(name) => done(`${name} added`)}
        />
      )}
      {modal?.kind === "edit" && (
        <ItemModal
          item={modal.item}
          categories={[...new Set((data?.items ?? []).map((i) => i.category).filter(Boolean) as string[])]}
          onClose={() => setModal(null)}
          onSaved={(name) => done(`${name} updated`)}
        />
      )}
      {modal?.kind === "receive" && (
        <ReceiveModal item={modal.item} initialQty={modal.quantity} onClose={() => setModal(null)} onSaved={done} />
      )}
      {modal?.kind === "count" && <CountModal item={modal.item} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.kind === "import" && (
        <InventoryImportModal items={data?.items ?? []} onClose={() => setModal(null)} onImported={done} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warn" | "bad" }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${tone === "bad" ? "text-red-400" : tone === "warn" ? "text-yellow-400" : "text-white"}`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: StockStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

// ── Stock ────────────────────────────────────────────────────────────────
function StockTab({
  items,
  canManage,
  onReceive,
  onCount,
  onEdit,
  onHistory,
  onDelete,
}: {
  items: InventoryOverviewItem[];
  canManage: boolean;
  onReceive: (i: InventoryOverviewItem) => void;
  onCount: (i: InventoryOverviewItem) => void;
  onEdit: (i: InventoryOverviewItem) => void;
  onHistory: (i: InventoryOverviewItem) => void;
  onDelete: (i: InventoryOverviewItem) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean) as string[])].sort();
  const shown = items.filter(
    (i) =>
      (!category || i.category === category) &&
      (!search.trim() || i.name.toLowerCase().includes(search.trim().toLowerCase()))
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="w-full max-w-xs rounded-md border border-neutral-700 px-3 py-2 text-sm"
        />
        {categories.length > 0 && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-black text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2">In stock</th>
              <th className="px-4 py-2">Lasts</th>
              <th className="px-4 py-2">Cost / unit</th>
              <th className="px-4 py-2">Value</th>
              <th className="px-4 py-2">Status</th>
              {canManage && <th className="px-4 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                  {items.length === 0 ? "No inventory items yet." : "Nothing matches."}
                </td>
              </tr>
            ) : (
              shown.map((i) => {
                const stock = Number(i.quantityInStock);
                const full = Math.max(Number(i.reorderLevel) * 3, stock, 1);
                return (
                  <tr key={i.id} className="border-t border-neutral-800 align-top">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-white">{i.name}</div>
                      <div className="text-xs text-neutral-500">
                        {i.category ?? "Uncategorised"}
                        {i.supplierName ? ` · ${i.supplierName}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className={stock < 0 ? "text-red-400" : "text-neutral-200"}>
                        {qty(stock)} {i.unit}
                      </div>
                      <div className="mt-1 h-1.5 w-24 rounded-full bg-neutral-800" title={`Reorder at ${qty(i.reorderLevel)} ${i.unit}`}>
                        <div
                          className={`h-1.5 rounded-full ${i.status === "OK" ? "bg-neutral-300" : i.status === "LOW" ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${Math.max(0, Math.min(100, (stock / full) * 100))}%` }}
                        />
                      </div>
                      <div className="mt-0.5 text-[11px] text-neutral-500">
                        reorder at {qty(i.reorderLevel)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-300">
                      {i.daysLeft === null ? (
                        <span className="text-neutral-500">no recent use</span>
                      ) : (
                        <>
                          {i.daysLeft > 365 ? "over a year" : `~${i.daysLeft} day${i.daysLeft === 1 ? "" : "s"}`}
                          <div className="text-[11px] text-neutral-500">
                            used {qty(i.used30)} in 30 days
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-300">{money(Number(i.costPerUnit))}</td>
                    <td className="px-4 py-2.5 text-neutral-300">{money(i.stockValue)}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={i.status} />
                    </td>
                    {canManage && (
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs">
                          <button onClick={() => onReceive(i)} className="font-semibold text-green-400 hover:underline">
                            + Receive
                          </button>
                          <button onClick={() => onCount(i)} className="font-medium text-neutral-300 hover:underline">
                            Count
                          </button>
                          <button onClick={() => onHistory(i)} className="font-medium text-neutral-300 hover:underline">
                            History
                          </button>
                          <button onClick={() => onEdit(i)} className="font-medium text-neutral-400 hover:underline">
                            Edit
                          </button>
                          <button onClick={() => onDelete(i)} className="font-medium text-red-500 hover:underline">
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Reorder ──────────────────────────────────────────────────────────────
/** Local 07x… numbers become 947x… for wa.me (Sri Lanka). */
function waNumber(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("0") ? `94${d.slice(1)}` : d;
}

function ReorderTab({
  items,
  canManage,
  onReceive,
}: {
  items: InventoryOverviewItem[];
  canManage: boolean;
  onReceive: (i: InventoryOverviewItem, quantity: number) => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const amount = (i: InventoryOverviewItem) => amounts[i.id] ?? i.suggestedOrder;

  const groups = useMemo(() => {
    const m = new Map<string, InventoryOverviewItem[]>();
    for (const i of items) {
      const key = i.supplierName ?? "";
      m.set(key, [...(m.get(key) ?? []), i]);
    }
    return [...m.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-center text-sm text-neutral-400">
        ✓ Everything is above its reorder level. Items appear here automatically when they run low.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([supplier, list]) => {
        const phone = list.find((i) => i.supplierPhone)?.supplierPhone;
        const total = list.reduce((s, i) => s + amount(i) * Number(i.costPerUnit), 0);
        const message =
          `Hello${supplier ? ` ${supplier}` : ""}, please send the following order:\n` +
          list.map((i) => `- ${i.name}: ${qty(amount(i))} ${i.unit}`).join("\n") +
          "\nThank you — D & D Auto Spa";
        return (
          <div key={supplier || "none"} className="rounded-lg border border-neutral-800 bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 px-4 py-3">
              <div>
                <div className="font-semibold text-white">{supplier || "No supplier set"}</div>
                <div className="text-xs text-neutral-500">
                  {phone ?? (supplier ? "no phone number" : "Edit an item to add its supplier")} · est. {money(Math.round(total * 100) / 100)}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard?.writeText(message)}
                  className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
                >
                  Copy order
                </button>
                {phone && (
                  <a
                    href={`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(message)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600"
                  >
                    Send order on WhatsApp
                  </a>
                )}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">In stock</th>
                  <th className="px-4 py-2">Order</th>
                  <th className="px-4 py-2">Est. cost</th>
                  {canManage && <th className="px-4 py-2 text-right" />}
                </tr>
              </thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id} className="border-t border-neutral-800">
                    <td className="px-4 py-2">
                      <span className="font-medium text-white">{i.name}</span>{" "}
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="px-4 py-2 text-neutral-300">
                      {qty(i.quantityInStock)} {i.unit}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={amount(i)}
                        onChange={(e) => setAmounts((a) => ({ ...a, [i.id]: Number(e.target.value) }))}
                        className="w-24 rounded-md border border-neutral-700 px-2 py-1 text-sm"
                        aria-label={`Order quantity for ${i.name}`}
                      />{" "}
                      <span className="text-xs text-neutral-500">{i.unit}</span>
                    </td>
                    <td className="px-4 py-2 text-neutral-300">{money(Math.round(amount(i) * Number(i.costPerUnit) * 100) / 100)}</td>
                    {canManage && (
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => onReceive(i, amount(i))}
                          className="text-xs font-semibold text-green-400 hover:underline"
                        >
                          Mark received
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="text-xs text-neutral-500">
        Suggested amounts: the item's fixed reorder quantity if set, otherwise enough for about a month of use (at least
        twice the reorder level).
      </p>
    </div>
  );
}

// ── Recipes ──────────────────────────────────────────────────────────────
function RecipesTab({ items, canManage, onSaved }: { items: InventoryOverviewItem[]; canManage: boolean; onSaved: () => void }) {
  const [recipes, setRecipes] = useState<ServiceRecipe[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inventoryApi.listServiceRecipes().then(setRecipes).catch((err) => setError(apiErrorMessage(err)));
  }, []);

  return (
    <div>
      <p className="mb-3 text-sm text-neutral-400">
        A reference of what one job of each service typically uses, and its material cost. Nothing is taken out of
        stock automatically — record the actual materials on each job in Daily Jobs (step 7).
      </p>
      {error && <div className="mb-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-500">{error}</div>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {recipes.map((r) => {
          const cost = r.consumables.reduce((s, c) => s + Number(c.quantity) * Number(c.item.costPerUnit), 0);
          return (
            <div key={r.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-white">{r.name}</div>
                  <div className="text-xs text-neutral-500">
                    {r.category?.name ?? ""} · materials ≈ {money(Math.round(cost * 100) / 100)} per job
                  </div>
                </div>
                {canManage && editing !== r.id && (
                  <button
                    onClick={() => setEditing(r.id)}
                    className="rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editing === r.id ? (
                <RecipeEditor
                  recipe={r}
                  items={items}
                  onCancel={() => setEditing(null)}
                  onSaved={(all) => {
                    setRecipes(all);
                    setEditing(null);
                    onSaved();
                  }}
                />
              ) : r.consumables.length === 0 ? (
                <div className="text-sm text-yellow-400">No recipe set for this service.</div>
              ) : (
                <ul className="space-y-1 text-sm">
                  {r.consumables.map((c) => (
                    <li key={c.itemId} className="flex justify-between text-neutral-300">
                      <span>{c.item.name}</span>
                      <span className="text-neutral-400">
                        {qty(c.quantity)} {c.item.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecipeEditor({
  recipe,
  items,
  onCancel,
  onSaved,
}: {
  recipe: ServiceRecipe;
  items: InventoryOverviewItem[];
  onCancel: () => void;
  onSaved: (all: ServiceRecipe[]) => void;
}) {
  const [lines, setLines] = useState(recipe.consumables.map((c) => ({ itemId: c.itemId, quantity: Number(c.quantity) })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const clean = lines.filter((l) => l.itemId && l.quantity > 0);
    if (new Set(clean.map((l) => l.itemId)).size !== clean.length) {
      setError("Each item can appear only once");
      return;
    }
    setSaving(true);
    try {
      onSaved(await inventoryApi.setServiceRecipe(recipe.id, clean));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      {lines.map((l, idx) => {
        const unit = items.find((i) => i.id === l.itemId)?.unit ?? "";
        return (
          <div key={idx} className="flex items-center gap-2">
            <select
              value={l.itemId}
              onChange={(e) => setLines((ls) => ls.map((x, j) => (j === idx ? { ...x, itemId: e.target.value } : x)))}
              className="min-w-0 flex-1 rounded-md border border-neutral-700 px-2 py-1.5 text-sm"
            >
              <option value="">Choose item...</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step="0.01"
              value={l.quantity}
              onChange={(e) => setLines((ls) => ls.map((x, j) => (j === idx ? { ...x, quantity: Number(e.target.value) } : x)))}
              className="w-20 rounded-md border border-neutral-700 px-2 py-1.5 text-sm"
              aria-label="Quantity per job"
            />
            <span className="w-12 text-xs text-neutral-500">{unit}</span>
            <button
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== idx))}
              className="text-neutral-500 hover:text-red-400"
              aria-label="Remove line"
            >
              ✕
            </button>
          </div>
        );
      })}
      <button
        onClick={() => setLines((ls) => [...ls, { itemId: "", quantity: 1 }])}
        className="text-xs font-medium text-red-400 hover:underline"
      >
        + Add material
      </button>
      {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-500">{error}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save recipe"}
        </button>
      </div>
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────────
const MOVE_LABEL: Record<StockMovement["type"], { label: string; cls: string }> = {
  RECEIVED: { label: "Received", cls: "text-green-400" },
  JOB_USAGE: { label: "Used on job", cls: "text-neutral-300" },
  ADJUSTMENT: { label: "Stock count", cls: "text-yellow-400" },
};

function HistoryTab({
  items,
  itemId,
  onItemChange,
}: {
  items: InventoryOverviewItem[];
  itemId: string;
  onItemChange: (id: string) => void;
}) {
  const [rows, setRows] = useState<StockMovement[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inventoryApi
      .listStockMovements(itemId || undefined)
      .then(setRows)
      .catch((err) => setError(apiErrorMessage(err)));
  }, [itemId]);

  return (
    <div>
      <div className="mb-3">
        <select
          value={itemId}
          onChange={(e) => onItemChange(e.target.value)}
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm"
        >
          <option value="">All items</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="mb-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-500">{error}</div>}
      <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-black text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2">What</th>
              <th className="px-4 py-2 text-right">Change</th>
              <th className="px-4 py-2 text-right">Balance</th>
              <th className="px-4 py-2">By / job</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  No stock changes yet.
                </td>
              </tr>
            ) : (
              rows.map((m) => {
                const q = Number(m.quantity);
                return (
                  <tr key={m.id} className="border-t border-neutral-800">
                    <td className="whitespace-nowrap px-4 py-2 text-neutral-400">
                      {new Date(m.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-2 text-white">{m.item.name}</td>
                    <td className="px-4 py-2">
                      <span className={MOVE_LABEL[m.type].cls}>{MOVE_LABEL[m.type].label}</span>
                      {m.note && <div className="text-xs text-neutral-500">{m.note}</div>}
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${q >= 0 ? "text-green-400" : "text-neutral-200"}`}>
                      {q >= 0 ? "+" : "−"}
                      {qty(Math.abs(q))} {m.item.unit}
                      {m.unitCost && <div className="text-[11px] font-normal text-neutral-500">@ {money(Number(m.unitCost))}</div>}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {qty(m.balanceAfter)} {m.item.unit}
                    </td>
                    <td className="px-4 py-2 text-neutral-400">
                      {m.user?.name ?? "System"}
                      {m.jobCard && (
                        <div>
                          <Link to={`/job-board/${m.jobCard.id}`} className="text-xs text-red-400 hover:underline">
                            {m.jobCard.booking.vehicle?.plateNumber ?? "job"}
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Modals ───────────────────────────────────────────────────────────────
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-300">{label}</label>
      {children}
      {hint && <div className="mt-0.5 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}

const inputCls = "w-full rounded-md border border-neutral-700 px-3 py-2 text-sm";

function ItemModal({
  item,
  categories,
  onClose,
  onSaved,
}: {
  item?: InventoryOverviewItem;
  categories: string[];
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [opening, setOpening] = useState(0);
  const [reorderLevel, setReorderLevel] = useState(Number(item?.reorderLevel ?? 0));
  const [reorderQuantity, setReorderQuantity] = useState(item?.reorderQuantity ? String(Number(item.reorderQuantity)) : "");
  const [costPerUnit, setCostPerUnit] = useState(Number(item?.costPerUnit ?? 0));
  const [supplierName, setSupplierName] = useState(item?.supplierName ?? "");
  const [supplierPhone, setSupplierPhone] = useState(item?.supplierPhone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const details = {
      name,
      unit,
      category: category || null,
      reorderLevel,
      reorderQuantity: reorderQuantity === "" ? null : Number(reorderQuantity),
      costPerUnit,
      supplierName: supplierName || null,
      supplierPhone: supplierPhone || null,
    };
    try {
      if (item) await inventoryApi.updateItem(item.id, details);
      else await inventoryApi.createItem({ ...details, quantityInStock: opening });
      onSaved(name);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={item ? `Edit — ${item.name}` : "New inventory item"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Name">
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Unit" hint="L, ml, pcs, bottle, roll...">
            <input required value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} list="units" />
            <datalist id="units">
              {["L", "ml", "kg", "pcs", "bottle", "roll", "box", "can"].map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Field>
          <Field label="Category">
            <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} list="categories" />
            <datalist id="categories">
              {[...new Set([...categories, "Chemicals", "Consumables", "Paint", "Parts", "Tools"])].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {!item && (
            <Field label="Stock now">
              <input type="number" min={0} step="0.01" value={opening} onChange={(e) => setOpening(Number(e.target.value))} className={inputCls} />
            </Field>
          )}
          <Field label="Cost / unit (Rs.)">
            <input type="number" min={0} step="0.01" value={costPerUnit} onChange={(e) => setCostPerUnit(Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Reorder level" hint="warn at or below">
            <input type="number" min={0} step="0.01" value={reorderLevel} onChange={(e) => setReorderLevel(Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Order amount" hint="blank = auto">
            <input type="number" min={0} step="0.01" value={reorderQuantity} onChange={(e) => setReorderQuantity(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Supplier (optional)">
            <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Supplier WhatsApp (optional)" hint="used for one-tap orders">
            <input value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} className={inputCls} placeholder="07X XXX XXXX" />
          </Field>
        </div>
        {item && <p className="text-xs text-neutral-500">Stock level changes through Receive or Count, so every change is in the history.</p>}
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-500">{error}</div>}
        <button type="submit" disabled={saving} className="w-full rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          {saving ? "Saving..." : item ? "Save changes" : "Add item"}
        </button>
      </form>
    </Modal>
  );
}

function ReceiveModal({
  item,
  initialQty,
  onClose,
  onSaved,
}: {
  item: InventoryOverviewItem;
  initialQty?: number;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [quantity, setQuantity] = useState(initialQty ?? 0);
  const [unitCost, setUnitCost] = useState(Number(item.costPerUnit) > 0 ? String(Number(item.costPerUnit)) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stock = Number(item.quantityInStock);
  const onHand = Math.max(0, stock);
  const avg =
    unitCost !== "" && quantity > 0
      ? (onHand * Number(item.costPerUnit) + quantity * Number(unitCost)) / (onHand + quantity)
      : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!(quantity > 0)) {
      setError("Enter how much arrived");
      return;
    }
    setSaving(true);
    try {
      await inventoryApi.receiveStock(item.id, {
        quantity,
        unitCost: unitCost === "" ? undefined : Number(unitCost),
        note: note || undefined,
      });
      onSaved(`Received ${qty(quantity)} ${item.unit} of ${item.name}`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Receive stock — ${item.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="text-sm text-neutral-400">
          In stock now: {qty(stock)} {item.unit}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Quantity received (${item.unit})`}>
            <input type="number" min={0} step="0.01" autoFocus value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Cost per unit (Rs.)" hint="from the supplier bill">
            <input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bill no., supplier..." className={inputCls} />
        </Field>
        <div className="rounded-md bg-black px-3 py-2 text-sm text-neutral-300">
          New stock: <span className="font-medium text-white">{qty(stock + quantity)} {item.unit}</span>
          {avg !== null && (
            <>
              {" "}· average cost becomes <span className="font-medium text-white">{money(Math.round(avg * 100) / 100)}</span>
            </>
          )}
        </div>
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-500">{error}</div>}
        <button type="submit" disabled={saving} className="w-full rounded-md bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50">
          {saving ? "Saving..." : "Add to stock"}
        </button>
      </form>
    </Modal>
  );
}

function CountModal({ item, onClose, onSaved }: { item: InventoryOverviewItem; onClose: () => void; onSaved: (msg: string) => void }) {
  const stock = Number(item.quantityInStock);
  const [counted, setCounted] = useState(Math.max(0, stock));
  const [reason, setReason] = useState("Stock count");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const diff = Math.round((counted - stock) * 100) / 100;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await inventoryApi.countStock(item.id, { counted, note: reason });
      onSaved(`${item.name} counted: ${qty(counted)} ${item.unit}`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Stock count — ${item.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="text-sm text-neutral-400">
          System says {qty(stock)} {item.unit}. Count what's on the shelf and enter it.
        </div>
        <Field label={`Counted (${item.unit})`}>
          <input type="number" min={0} step="0.01" autoFocus value={counted} onChange={(e) => setCounted(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Reason">
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
            {["Stock count", "Damaged / spilled", "Expired", "Used, not recorded", "Found extra"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <div className={`text-sm ${diff === 0 ? "text-neutral-400" : diff > 0 ? "text-green-400" : "text-yellow-400"}`}>
          {diff === 0 ? "No difference." : `Difference: ${diff > 0 ? "+" : "−"}${qty(Math.abs(diff))} ${item.unit}`}
        </div>
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-500">{error}</div>}
        <button type="submit" disabled={saving || diff === 0} className="w-full rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          {saving ? "Saving..." : "Save count"}
        </button>
      </form>
    </Modal>
  );
}
