import { useRef, useState, type DragEvent } from "react";
import * as XLSX from "xlsx";
import * as inventoryApi from "../api/inventory";
import type { ImportRowInput, InventoryOverviewItem } from "../api/inventory";
import { apiErrorMessage } from "../api/client";
import { Modal } from "./Modal";

type Field = "name" | "quantity" | "unit" | "unitCost" | "category" | "reorderLevel" | "supplierName" | "supplierPhone";

const FIELDS: { key: Field; label: string; required?: boolean; synonyms: string[] }[] = [
  { key: "name", label: "Item name", required: true, synonyms: ["name", "item", "product", "description", "item name", "product name", "particulars"] },
  { key: "quantity", label: "Quantity", synonyms: ["qty", "quantity", "stock", "in stock", "count", "amount", "units"] },
  { key: "unit", label: "Unit", synonyms: ["unit", "uom", "units of measure", "measure", "pack", "packing", "size"] },
  { key: "unitCost", label: "Cost / unit", synonyms: ["cost", "unit cost", "price", "unit price", "rate", "cost per unit", "mrp", "buying price"] },
  { key: "category", label: "Category", synonyms: ["category", "type", "group"] },
  { key: "reorderLevel", label: "Reorder level", synonyms: ["reorder", "reorder level", "min", "minimum", "min stock"] },
  { key: "supplierName", label: "Supplier", synonyms: ["supplier", "vendor", "supplier name"] },
  { key: "supplierPhone", label: "Supplier phone", synonyms: ["phone", "supplier phone", "mobile", "contact", "whatsapp"] },
];

const TEMPLATE =
  "Item name,Quantity,Unit,Cost per unit,Category,Reorder level,Supplier,Supplier phone\n" +
  "Car Shampoo,20,L,5.50,Chemicals,5,ABC Traders,0771234567\n" +
  "Microfiber Cloth,100,pcs,0.40,Consumables,20,ABC Traders,0771234567\n";

/** "Rs. 1,250.00" → 1250; blank/garbage → null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // First real number in the cell — so the "." in "Rs." isn't mistaken
  // for a decimal point. Thousands separators are dropped first.
  const m = String(v).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

interface ReviewRow extends ImportRowInput {
  key: number;
  include: boolean;
}

type Stage = { kind: "pick" } | { kind: "map"; headers: string[]; data: unknown[][]; fileName: string } | { kind: "scanning"; fileName: string } | { kind: "review"; source: string };

/**
 * Inventory import: CSV, Excel, PDF or photo → editable review → one
 * transaction. Spreadsheets are read in the browser (columns auto-matched,
 * adjustable); PDFs/photos are read on the server by Claude. Rows that match
 * an existing item by name receive stock into it; the rest become new items.
 */
export function InventoryImportModal({
  items,
  onClose,
  onImported,
}: {
  items: InventoryOverviewItem[];
  onClose: () => void;
  onImported: (msg: string) => void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [mapping, setMapping] = useState<Record<Field, number>>({} as Record<Field, number>);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [accept, setAccept] = useState("");

  const byName = new Map(items.map((i) => [i.name.trim().toLowerCase(), i]));

  function toReview(list: ImportRowInput[], source: string) {
    setRows(
      list
        .filter((r) => r.name.trim())
        .map((r, idx) => {
          const match = byName.get(r.name.trim().toLowerCase());
          return { ...r, key: idx, include: true, itemId: match?.id ?? null, unit: r.unit || match?.unit || "pcs" };
        })
    );
    setStage({ kind: "review", source });
  }

  async function handleFile(file: File) {
    setError(null);
    const name = file.name.toLowerCase();
    const isSheet = /\.(csv|xlsx|xls|ods)$/.test(name);
    const isScan = file.type === "application/pdf" || name.endsWith(".pdf") || file.type.startsWith("image/");
    if (isSheet) {
      try {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const all = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
        // Header = first row with at least two text cells.
        const hIdx = all.findIndex((r) => r.filter((c) => typeof c === "string" && c.trim()).length >= 2);
        if (hIdx < 0) throw new Error("Couldn't find a header row (e.g. Item name, Quantity, Unit...)");
        const headers = all[hIdx].map((h) => text(h));
        // "Rate (Rs.)" → "rate", "Unit_Price*" → "unit price"; exact heading
        // matches win, then any single word of the heading.
        const norm = (h: string) =>
          h.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z]+/g, " ").trim();
        const normed = headers.map(norm);
        const auto = {} as Record<Field, number>;
        const used = new Set<number>();
        for (const pass of ["exact", "word"] as const)
          for (const f of FIELDS) {
            if (auto[f.key] >= 0) continue;
            const i = normed.findIndex(
              (h, idx) =>
                !used.has(idx) &&
                (pass === "exact" ? f.synonyms.includes(h) : h.split(" ").some((w) => f.synonyms.includes(w)))
            );
            auto[f.key] = i;
            if (i >= 0) used.add(i);
          }
        setMapping(auto);
        setStage({ kind: "map", headers, data: all.slice(hIdx + 1), fileName: file.name });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't read that file");
      }
      return;
    }
    if (isScan) {
      setStage({ kind: "scanning", fileName: file.name });
      try {
        const doc = await inventoryApi.scanStockDocument(file);
        setSupplierName(doc.supplierName ?? "");
        setSupplierPhone(doc.supplierPhone ?? "");
        setNote(doc.documentNote ?? `Imported from ${file.name}`);
        if (doc.items.length === 0) {
          setError("No items were found on that document.");
          setStage({ kind: "pick" });
          return;
        }
        toReview(
          doc.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost, category: i.category })),
          file.name
        );
      } catch (err) {
        setError(apiErrorMessage(err));
        setStage({ kind: "pick" });
      }
      return;
    }
    setError("Use a CSV, Excel (.xlsx/.xls), PDF, or JPG/PNG photo.");
  }

  function applyMapping() {
    if (stage.kind !== "map") return;
    if (mapping.name < 0 || mapping.name === undefined) {
      setError("Choose which column has the item name");
      return;
    }
    const col = (r: unknown[], f: Field) => (mapping[f] >= 0 ? r[mapping[f]] : undefined);
    const list: ImportRowInput[] = stage.data.map((r) => ({
      name: text(col(r, "name")),
      quantity: num(col(r, "quantity")) ?? 0,
      unit: text(col(r, "unit")),
      unitCost: num(col(r, "unitCost")),
      category: text(col(r, "category")) || null,
      reorderLevel: num(col(r, "reorderLevel")),
      supplierName: text(col(r, "supplierName")) || null,
      supplierPhone: text(col(r, "supplierPhone")) || null,
    }));
    setNote(`Imported from ${stage.fileName}`);
    setError(null);
    toReview(list, stage.fileName);
  }

  const update = (key: number, patch: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const chosen = rows.filter((r) => r.include && r.name.trim());
  const newCount = chosen.filter((r) => !r.itemId).length;
  const receiveCount = chosen.filter((r) => r.itemId && r.quantity > 0).length;

  async function doImport() {
    setError(null);
    if (chosen.length === 0) {
      setError("Select at least one row");
      return;
    }
    setSaving(true);
    try {
      const res = await inventoryApi.importInventory(
        chosen.map((r) => ({
          itemId: r.itemId || null,
          name: r.name.trim(),
          unit: (r.unit || "pcs").trim(),
          quantity: Math.max(0, r.quantity || 0),
          unitCost: r.unitCost ?? null,
          category: r.category || null,
          reorderLevel: r.reorderLevel ?? null,
          supplierName: r.supplierName || supplierName || null,
          supplierPhone: r.supplierPhone || supplierPhone || null,
        })),
        note || undefined
      );
      onImported(`Imported: ${res.created} new item(s), stock added to ${res.received} existing item(s).`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function pick(acc: string) {
    setAccept(acc);
    setTimeout(() => fileInput.current?.click(), 0);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  const cell = "rounded border border-neutral-700 bg-black px-2 py-1 text-xs";

  return (
    <Modal title="Import items" onClose={onClose} wide>
      <input
        ref={fileInput}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {stage.kind === "pick" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-lg border-2 border-dashed p-4 ${dragOver ? "border-red-600 bg-red-950/20" : "border-neutral-800"}`}
        >
          <p className="mb-3 text-sm text-neutral-300">Choose how to add items — or drop a file here.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "CSV", icon: "📄", hint: "comma-separated", acc: ".csv,text/csv" },
              { label: "Excel", icon: "📊", hint: ".xlsx / .xls", acc: ".xlsx,.xls,.ods" },
              { label: "PDF", icon: "🧾", hint: "supplier bill", acc: ".pdf,application/pdf" },
              { label: "Photo", icon: "📷", hint: "photo of a bill", acc: "image/*" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => pick(o.acc)}
                className="flex flex-col items-center gap-1 rounded-lg border border-neutral-800 bg-black px-3 py-5 hover:border-red-600"
              >
                <span className="text-3xl" aria-hidden>
                  {o.icon}
                </span>
                <span className="font-semibold text-white">{o.label}</span>
                <span className="text-xs text-neutral-500">{o.hint}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
            <span>PDF and photos are read automatically — you check every row before anything is saved.</span>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
              download="inventory-template.csv"
              className="text-red-400 underline"
            >
              Download CSV template
            </a>
          </div>
        </div>
      )}

      {stage.kind === "scanning" && (
        <div className="py-10 text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-red-600" />
          <div className="text-sm text-white">Reading {stage.fileName}…</div>
          <div className="text-xs text-neutral-500">This usually takes 10–60 seconds.</div>
        </div>
      )}

      {stage.kind === "map" && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-300">
            Match the columns in <span className="text-white">{stage.fileName}</span> ({stage.data.length} rows). We guessed
            from the headings — fix any that are wrong.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FIELDS.map((f) => (
              <label key={f.key} className="text-xs text-neutral-400">
                {f.label}
                {f.required && " *"}
                <select
                  value={mapping[f.key] ?? -1}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-md border border-neutral-700 px-2 py-1.5 text-sm"
                >
                  <option value={-1}>— not in file —</option>
                  {stage.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="overflow-x-auto rounded-md border border-neutral-800">
            <table className="w-full text-xs">
              <thead className="bg-black text-left text-neutral-500">
                <tr>
                  {stage.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stage.data.slice(0, 4).map((r, i) => (
                  <tr key={i} className="border-t border-neutral-800 text-neutral-300">
                    {stage.headers.map((_, j) => (
                      <td key={j} className="px-2 py-1">
                        {text(r[j])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStage({ kind: "pick" })} className="text-sm text-neutral-400 hover:text-white">
              ← Choose another file
            </button>
            <button onClick={applyMapping} className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
              Continue →
            </button>
          </div>
        </div>
      )}

      {stage.kind === "review" && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-300">
            Check the rows from <span className="text-white">{stage.source}</span>. Rows matched to an existing item add
            stock to it; the others become new items.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-xs text-neutral-400">
              Supplier (for new items)
              <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="mt-1 w-full rounded-md border border-neutral-700 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-neutral-400">
              Supplier phone
              <input value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} className="mt-1 w-full rounded-md border border-neutral-700 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-neutral-400">
              Note (bill no.)
              <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-md border border-neutral-700 px-2 py-1.5 text-sm" />
            </label>
          </div>
          <div className="max-h-[45vh] overflow-auto rounded-md border border-neutral-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-black text-left text-neutral-500">
                <tr>
                  <th className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={rows.every((r) => r.include)}
                      onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))}
                    />
                  </th>
                  <th className="px-2 py-1.5">Item</th>
                  <th className="px-2 py-1.5">Goes to</th>
                  <th className="px-2 py-1.5">Qty</th>
                  <th className="px-2 py-1.5">Unit</th>
                  <th className="px-2 py-1.5">Cost / unit</th>
                  <th className="px-2 py-1.5">Category</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={`border-t border-neutral-800 ${r.include ? "" : "opacity-40"}`}>
                    <td className="px-2 py-1">
                      <input type="checkbox" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} aria-label={`Include ${r.name}`} />
                    </td>
                    <td className="px-2 py-1">
                      <input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} className={`${cell} w-40`} />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={r.itemId ?? ""}
                        onChange={(e) => {
                          const it = items.find((i) => i.id === e.target.value);
                          update(r.key, { itemId: e.target.value || null, unit: it?.unit ?? r.unit });
                        }}
                        className={`${cell} w-40 ${r.itemId ? "text-green-400" : "text-yellow-300"}`}
                      >
                        <option value="">＋ New item</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" min={0} step="0.01" value={r.quantity} onChange={(e) => update(r.key, { quantity: Number(e.target.value) })} className={`${cell} w-20`} />
                    </td>
                    <td className="px-2 py-1">
                      <input value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} disabled={!!r.itemId} className={`${cell} w-16 disabled:opacity-60`} />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.unitCost ?? ""}
                        onChange={(e) => update(r.key, { unitCost: e.target.value === "" ? null : Number(e.target.value) })}
                        className={`${cell} w-20`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={r.category ?? ""}
                        onChange={(e) => update(r.key, { category: e.target.value || null })}
                        disabled={!!r.itemId}
                        className={`${cell} w-28 disabled:opacity-60`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => setStage({ kind: "pick" })} className="text-sm text-neutral-400 hover:text-white">
              ← Start over
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-400">
                {newCount} new item(s) · stock added to {receiveCount} existing
              </span>
              <button
                onClick={doImport}
                disabled={saving || chosen.length === 0}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? "Importing..." : `Import ${chosen.length} row(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="mt-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-500">{error}</div>}
    </Modal>
  );
}
