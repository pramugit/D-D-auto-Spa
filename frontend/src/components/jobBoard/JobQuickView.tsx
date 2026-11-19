import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import * as jobCardsApi from "../../api/jobCards";
import { apiErrorMessage, resolveMediaUrl } from "../../api/client";
import type { JobCard } from "../../api/types";
import { JOB_STATUS_FLOW, PHOTO_STATUSES } from "../../config/jobCardWorkflow";
import { formatMileage, vehicleTypeLabel } from "../../config/vehicleTypes";
import type { TechnicianSummary } from "../StartJobModal";
import {
  INVOICE_BADGE,
  STAGE_ORDER,
  STAGE_STYLE,
  fmtDuration,
  fmtTime,
  initials,
  jobFlags,
  jobValue,
  minutesInStage,
  money,
} from "./jobBoardUtils";

/**
 * Job Board quick view — slides in from the right with everything about a
 * job and the common actions (next stage, photo to WhatsApp, technicians,
 * notes), so a manager can run the floor without leaving the board.
 */
export function JobQuickView({
  job,
  now,
  canAct,
  busy,
  technicians,
  onClose,
  onAdvance,
  onCamera,
  onFile,
  onChanged,
}: {
  job: JobCard;
  now: number;
  canAct: boolean;
  busy: boolean;
  technicians: TechnicianSummary[];
  onClose: () => void;
  onAdvance: (job: JobCard) => void;
  onCamera: (job: JobCard) => void;
  onFile: (job: JobCard, file: File) => void;
  onChanged: () => Promise<void> | void;
}) {
  const b = job.booking;
  const step = JOB_STATUS_FLOW.find((s) => s.status === job.status);
  const stageIdx = STAGE_ORDER.indexOf(job.status);
  const flags = jobFlags(job, now);
  const style = STAGE_STYLE[job.status] ?? STAGE_STYLE.COMPLETED;

  const [notes, setNotes] = useState(job.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [editTechs, setEditTechs] = useState(false);
  const [techSel, setTechSel] = useState<Set<string>>(new Set(job.technicians.map((t) => t.userId)));
  const [savingTechs, setSavingTechs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setNotes(job.notes ?? "");
    setTechSel(new Set(job.technicians.map((t) => t.userId)));
    setEditTechs(false);
    setError(null);
    setSaved(null);
    // Reset only when a different job is opened, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveNotes() {
    setSavingNotes(true);
    setError(null);
    try {
      await jobCardsApi.updateJobCardNotes(job.id, notes.trim());
      setSaved("Notes saved");
      await onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSavingNotes(false);
    }
  }

  async function saveTechs() {
    if (techSel.size === 0) return setError("Pick at least one technician");
    setSavingTechs(true);
    setError(null);
    try {
      await jobCardsApi.assignTechnicians(job.id, [...techSel]);
      setEditTechs(false);
      setSaved("Technicians updated — the customer gets a WhatsApp update");
      await onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSavingTechs(false);
    }
  }

  const phoneDigits = (b.customer?.phone ?? "").replace(/\D/g, "").replace(/^0/, "94");
  const photos = [...job.photos].sort((x, y) => y.uploadedAt.localeCompare(x.uploadedAt));
  const usages = job.inventoryUsages ?? [];
  const materialCost = usages.reduce(
    (s, u) =>
      s + Number(u.quantityUsed) * Number(u.sourceType === "EXTERNAL_PURCHASE" ? u.externalCost ?? 0 : u.item?.costPerUnit ?? 0),
    0
  );
  const notesChanged = notes.trim() !== (job.notes ?? "").trim();

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={`Job ${b.vehicle?.plateNumber ?? ""}`}
        className="animate-slide-in-right relative flex h-full w-full max-w-xl flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl"
      >
        {/* Header */}
        <div className={`border-t-4 ${style.stripe} border-b border-b-neutral-800 px-5 py-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-2xl font-bold tracking-wide text-white">{b.vehicle?.plateNumber}</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.soft}`}>{step?.label ?? job.status}</span>
                {b.isWalkIn && <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">Walk-in</span>}
              </div>
              <p className="mt-0.5 text-sm text-neutral-400">
                {[b.vehicle?.year, b.vehicle?.make, b.vehicle?.model].filter(Boolean).join(" ")}
                {b.vehicle?.color ? ` · ${b.vehicle.color}` : ""}
                {b.vehicle?.vehicleType ? ` · ${vehicleTypeLabel(b.vehicle.vehicleType)}` : ""}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* Stage stepper */}
          <ol className="mt-4 flex items-center gap-1">
            {STAGE_ORDER.map((s, i) => {
              const st = STAGE_STYLE[s];
              const label = JOB_STATUS_FLOW.find((f) => f.status === s)?.label ?? s;
              return (
                <li key={s} className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className={`h-1.5 rounded-full ${i <= stageIdx ? st.dot : "bg-neutral-800"}`} />
                  <span className={`truncate text-[10px] ${i === stageIdx ? "font-semibold text-white" : "text-neutral-500"}`}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{error}</div>}
          {saved && <div className="rounded-md bg-emerald-950 px-3 py-2 text-sm text-emerald-300">{saved}</div>}

          {flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {flags.map((f) => (
                <span
                  key={f.key}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    f.tone === "red" ? "bg-red-950 text-red-300" : "bg-amber-950 text-amber-300"
                  }`}
                >
                  ⚠ {f.label}
                </span>
              ))}
            </div>
          )}

          {/* Key facts */}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Fact label="Customer">
              <div className="font-medium text-white">{b.customer?.name}</div>
              {b.customer?.phone && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <a href={`tel:${b.customer.phone}`} className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200 hover:bg-red-600">
                    📞 {b.customer.phone}
                  </a>
                  <a
                    href={`https://wa.me/${phoneDigits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200 hover:bg-emerald-700"
                  >
                    WhatsApp
                  </a>
                </div>
              )}
            </Fact>
            <Fact label="In this stage">
              <div className={`font-semibold ${flags.some((f) => f.key === "slow") ? "text-red-400" : "text-white"}`}>
                {fmtDuration(minutesInStage(job, now))}
              </div>
            </Fact>
            <Fact label={b.isWalkIn ? "Arrived" : "Scheduled"}>{fmtTime(b.scheduledAt)}</Fact>
            <Fact label="Bay">{b.bay?.name ?? "—"}</Fact>
            <Fact label="Started">{job.startedAt ? fmtTime(job.startedAt) : "—"}</Fact>
            <Fact label="Mileage">{b.mileage != null ? formatMileage(b.mileage) : "—"}</Fact>
          </dl>

          {/* Technicians */}
          <Section
            title="Technicians"
            action={
              canAct &&
              job.status !== "COMPLETED" &&
              !editTechs && (
                <button onClick={() => setEditTechs(true)} className="text-xs font-medium text-red-400 hover:text-red-300">
                  Change
                </button>
              )
            }
          >
            {editTechs ? (
              <div>
                <div className="grid grid-cols-2 gap-1.5">
                  {technicians.map((t) => (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-800 px-2 py-1.5 text-sm hover:bg-neutral-900"
                    >
                      <input
                        type="checkbox"
                        checked={techSel.has(t.id)}
                        onChange={() =>
                          setTechSel((prev) => {
                            const n = new Set(prev);
                            if (n.has(t.id)) n.delete(t.id);
                            else n.add(t.id);
                            return n;
                          })
                        }
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-neutral-500">The customer gets a WhatsApp update when this changes.</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={saveTechs}
                    disabled={savingTechs}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {savingTechs ? "Saving..." : "Save"}
                  </button>
                  <button onClick={() => setEditTechs(false)} className="rounded-md px-3 py-1.5 text-xs text-neutral-400 hover:text-white">
                    Cancel
                  </button>
                </div>
              </div>
            ) : job.technicians.length === 0 ? (
              <p className="text-sm text-amber-300">No technician assigned yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {job.technicians.map((t) => (
                  <span key={t.userId} className="flex items-center gap-2 rounded-full bg-neutral-900 py-1 pl-1 pr-3 text-sm text-neutral-200">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-700 text-[10px] font-bold text-white">
                      {initials(t.user.name)}
                    </span>
                    {t.user.name}
                  </span>
                ))}
              </div>
            )}
          </Section>

          {/* Services & money */}
          <Section title="Services & billing">
            <ul className="divide-y divide-neutral-800 rounded-md border border-neutral-800 text-sm">
              {(b.services ?? []).map((s) => (
                <li key={s.id} className="flex justify-between gap-3 px-3 py-2">
                  <span className="text-neutral-200">
                    {s.service?.name ?? s.package?.name}
                    {s.package && <span className="ml-1.5 text-xs text-neutral-500">package</span>}
                  </span>
                  <span className="text-neutral-400">{money(Number(s.price))}</span>
                </li>
              ))}
              {(b.services ?? []).length === 0 && <li className="px-3 py-2 text-neutral-500">No services listed</li>}
            </ul>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              {job.invoice ? (
                <span className="flex items-center gap-2 text-neutral-300">
                  INV-{String(job.invoice.invoiceNumber).padStart(6, "0")}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${INVOICE_BADGE[job.invoice.status].cls}`}>
                    {INVOICE_BADGE[job.invoice.status].label}
                  </span>
                </span>
              ) : (
                <span className="text-neutral-500">No invoice yet</span>
              )}
              <span className="text-base font-semibold text-white">{money(jobValue(job))}</span>
            </div>
            {usages.length > 0 && (
              <p className="mt-1 text-xs text-neutral-500">
                Materials used: {usages.length} item{usages.length === 1 ? "" : "s"} · {money(materialCost)}
              </p>
            )}
          </Section>

          {/* Photos */}
          <Section title={`Photos (${photos.length})`}>
            {photos.length === 0 ? (
              <p className="text-sm text-neutral-500">No photos yet.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {photos.slice(0, 8).map((p) => (
                  <a
                    key={p.id}
                    href={resolveMediaUrl(p.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square overflow-hidden rounded-md bg-neutral-900"
                  >
                    <img src={resolveMediaUrl(p.url)} alt={`${p.type} photo`} className="h-full w-full object-cover transition group-hover:scale-105" />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center text-[9px] uppercase text-neutral-300">
                      {p.type}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setSaved(null);
              }}
              disabled={!canAct}
              rows={3}
              placeholder="Anything the team should know about this job..."
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
            />
            {canAct && notesChanged && (
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {savingNotes ? "Saving..." : "Save notes"}
              </button>
            )}
          </Section>
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 bg-neutral-950 px-5 py-3">
          {canAct && step?.next && (
            <button
              onClick={() => onAdvance(job)}
              disabled={busy}
              className="flex-1 rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Updating..." : `${step.nextLabel} →`}
            </button>
          )}
          {canAct && PHOTO_STATUSES.includes(job.status) && (
            <>
              <button
                onClick={() => onCamera(job)}
                title="Take a photo and send it to the customer on WhatsApp"
                className="rounded-md border border-neutral-700 px-3 py-2.5 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                📷
              </button>
              <label
                title="Choose a photo and send it to the customer on WhatsApp"
                className="cursor-pointer rounded-md border border-neutral-700 px-3 py-2.5 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                🖼️
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(job, f);
                    e.target.value = "";
                  }}
                />
              </label>
            </>
          )}
          <Link
            to={`/job-board/${job.id}`}
            className="rounded-md border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
          >
            Full job card →
          </Link>
        </div>
      </aside>
    </div>,
    document.body
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-neutral-200">{children}</dd>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
