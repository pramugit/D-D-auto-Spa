import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as jobCardsApi from "../api/jobCards";
import * as usersApi from "../api/users";
import * as inventoryApi from "../api/inventory";
import * as billingApi from "../api/billing";
import type { DamageMarking, InspectionStage, InventoryItem, JobCard, PhotoType, StaffUser } from "../api/types";
import { apiErrorMessage, API_URL } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { CarDiagram } from "../components/CarDiagram";
import { useAuth } from "../hooks/useAuth";

export function JobCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [jobCard, setJobCard] = useState<JobCard | null>(null);
  const [technicians, setTechnicians] = useState<StaffUser[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setError(null);
    try {
      const [jc, users, items] = await Promise.all([
        jobCardsApi.getJobCard(id),
        usersApi.listUsers(),
        inventoryApi.listInventoryItems(),
      ]);
      setJobCard(jc);
      setTechnicians(users.filter((u) => u.role === "TECHNICIAN"));
      setInventoryItems(items);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>;
  if (!jobCard) return <div className="text-slate-400">Loading...</div>;

  const preInspection = jobCard.damageInspections.find((d) => d.stage === "PRE_SERVICE");
  const postInspection = jobCard.damageInspections.find((d) => d.stage === "POST_SERVICE");
  const canManage = user && ["ADMIN", "MANAGER", "RECEPTIONIST"].includes(user.role);

  async function handleAssign(selectedIds: string[]) {
    if (!id) return;
    setError(null);
    try {
      await jobCardsApi.assignTechnicians(id, selectedIds);
      setNotice("Technicians updated");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleSaveInspection(stage: InspectionStage, markings: DamageMarking[]) {
    if (!id) return;
    setError(null);
    try {
      await jobCardsApi.createDamageInspection(id, stage, markings);
      setNotice(`${stage.replace("_", " ")} inspection saved`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleAcknowledge(inspectionId: string) {
    setError(null);
    try {
      await jobCardsApi.acknowledgeDamageInspection(inspectionId);
      setNotice("Inspection acknowledged");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handlePhotoUpload(file: File, type: PhotoType) {
    if (!id) return;
    setError(null);
    try {
      await jobCardsApi.uploadPhoto(id, file, type);
      setNotice(`${type} photo uploaded`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleInventoryUsage(itemId: string, quantity: number) {
    if (!id) return;
    setError(null);
    try {
      const res = await jobCardsApi.recordInventoryUsage(id, itemId, quantity);
      setNotice(res.lowStockWarning ?? "Inventory usage recorded");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleCreateInvoice() {
    if (!id) return;
    setError(null);
    try {
      const invoice = await billingApi.createInvoice(id);
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <Link to="/job-board" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Back to Job Board
      </Link>

      <div className="mb-6 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            {jobCard.booking.vehicle?.plateNumber} — {jobCard.booking.vehicle?.make} {jobCard.booking.vehicle?.model}
          </h1>
          <div className="text-sm text-slate-500">{jobCard.booking.customer?.name}</div>
        </div>
        <StatusBadge status={jobCard.status} />
      </div>

      {notice && <div className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Booked Services</h2>
          <ul className="space-y-1 text-sm">
            {jobCard.booking.services?.map((s) => (
              <li key={s.id} className="flex justify-between text-slate-600">
                <span>{s.service?.name ?? s.package?.name}</span>
                <span>${s.price}</span>
              </li>
            ))}
          </ul>
        </div>

        <TechnicianAssignment
          technicians={technicians}
          assignedIds={jobCard.technicians.map((t) => t.userId)}
          disabled={!canManage}
          onAssign={handleAssign}
        />
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase text-slate-500">Damage Inspection</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700">Pre-Service</h3>
            {preInspection ? (
              <>
                <CarDiagram markings={preInspection.diagramMarkings} />
                <div className="mt-2 text-xs">
                  {preInspection.customerAcknowledged ? (
                    <span className="text-green-600">✓ Acknowledged by customer</span>
                  ) : (
                    <button
                      onClick={() => handleAcknowledge(preInspection.id)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50"
                    >
                      Record customer acknowledgement
                    </button>
                  )}
                </div>
              </>
            ) : (
              <DamageInspectionEditor onSave={(markings) => handleSaveInspection("PRE_SERVICE", markings)} />
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700">Post-Service</h3>
            {postInspection ? (
              <>
                <CarDiagram markings={postInspection.diagramMarkings} />
                <div className="mt-2 text-xs">
                  {postInspection.customerAcknowledged ? (
                    <span className="text-green-600">✓ Acknowledged by customer</span>
                  ) : (
                    <button
                      onClick={() => handleAcknowledge(postInspection.id)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50"
                    >
                      Record customer acknowledgement
                    </button>
                  )}
                </div>
              </>
            ) : preInspection ? (
              <DamageInspectionEditor onSave={(markings) => handleSaveInspection("POST_SERVICE", markings)} />
            ) : (
              <div className="text-sm text-slate-400">Complete the pre-service inspection first.</div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <PhotoSection jobCard={jobCard} onUpload={handlePhotoUpload} />
        <InventoryUsageSection items={inventoryItems} onUse={handleInventoryUsage} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Invoice</h2>
        {jobCard.invoice ? (
          <Link to={`/invoices/${jobCard.invoice.id}`} className="text-sm text-slate-700 hover:underline">
            View invoice — ${jobCard.invoice.total} ({jobCard.invoice.status})
          </Link>
        ) : canManage ? (
          <button
            onClick={handleCreateInvoice}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Generate Invoice
          </button>
        ) : (
          <div className="text-sm text-slate-400">No invoice yet.</div>
        )}
      </div>
    </div>
  );
}

function TechnicianAssignment({
  technicians,
  assignedIds,
  disabled,
  onAssign,
}: {
  technicians: StaffUser[];
  assignedIds: string[];
  disabled?: boolean;
  onAssign: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedIds));

  useEffect(() => {
    setSelected(new Set(assignedIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedIds.join(",")]);

  function toggle(idVal: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idVal)) next.delete(idVal);
      else next.add(idVal);
      return next;
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Assigned Technicians</h2>
      <div className="space-y-1">
        {technicians.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={disabled}
              checked={selected.has(t.id)}
              onChange={() => toggle(t.id)}
            />
            {t.name}
          </label>
        ))}
      </div>
      {!disabled && (
        <button
          onClick={() => onAssign(Array.from(selected))}
          className="mt-3 rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Save Assignment
        </button>
      )}
    </div>
  );
}

function PhotoSection({
  jobCard,
  onUpload,
}: {
  jobCard: JobCard;
  onUpload: (file: File, type: PhotoType) => void;
}) {
  const before = jobCard.photos.filter((p) => p.type === "BEFORE");
  const after = jobCard.photos.filter((p) => p.type === "AFTER");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Photos</h2>
      <div className="grid grid-cols-2 gap-3">
        <PhotoUploadColumn label="Before" photos={before} onUpload={(f) => onUpload(f, "BEFORE")} />
        <PhotoUploadColumn label="After" photos={after} onUpload={(f) => onUpload(f, "AFTER")} />
      </div>
    </div>
  );
}

function PhotoUploadColumn({
  label,
  photos,
  onUpload,
}: {
  label: string;
  photos: { id: string; url: string }[];
  onUpload: (file: File) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase text-slate-400">{label}</div>
      <div className="mb-2 grid grid-cols-3 gap-1">
        {photos.map((p) => (
          <a key={p.id} href={`${API_URL}${p.url}`} target="_blank" rel="noreferrer">
            <img src={`${API_URL}${p.url}`} className="h-16 w-full rounded object-cover" alt={label} />
          </a>
        ))}
      </div>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
        className="w-full text-xs"
      />
    </div>
  );
}

function DamageInspectionEditor({ onSave }: { onSave: (markings: DamageMarking[]) => void }) {
  const [draft, setDraft] = useState<DamageMarking[]>([]);

  return (
    <div>
      <CarDiagram
        markings={draft}
        editable
        onAddMarking={(m) => setDraft((prev) => [...prev, m])}
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={draft.length === 0}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Save Inspection ({draft.length} marker{draft.length === 1 ? "" : "s"})
        </button>
        {draft.length > 0 && (
          <button
            type="button"
            onClick={() => setDraft([])}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function InventoryUsageSection({
  items,
  onUse,
}: {
  items: InventoryItem[];
  onUse: (itemId: string, quantity: number) => void;
}) {
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Inventory Used</h2>
      <div className="flex gap-2">
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Select item...</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.quantityInStock} {i.unit} left)
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0.01}
          step="0.01"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button
          onClick={() => itemId && onUse(itemId, quantity)}
          disabled={!itemId}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Use
        </button>
      </div>
    </div>
  );
}
