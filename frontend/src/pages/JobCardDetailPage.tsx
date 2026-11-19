import { formatMinutes } from "../utils/duration";
import { formatMileage, vehicleTypeLabel } from "../config/vehicleTypes";
import { useEffect, useState } from "react";
import { formatMoney } from "../utils/money";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import * as jobCardsApi from "../api/jobCards";
import * as usersApi from "../api/users";
import * as inventoryApi from "../api/inventory";
import * as damageTypesApi from "../api/damageTypes";
import * as billingApi from "../api/billing";
import * as bookingsApi from "../api/bookings";
import type {
  BookingActivityLogEntry,
  BookingStatus,
  DamageMarking,
  DamageType,
  InventoryItem,
  JobCard,
  PhotoType,
  ProfitBreakdown,
  StaffUser,
  VehicleType,
} from "../api/types";
import { apiErrorMessage, API_URL } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { DamageInspectionDiagram, type NewMarkingDraft } from "../components/DamageInspectionDiagram";
import { InspectionApprovalSteps } from "../components/InspectionApprovalSteps";
import { BookedJobFlow } from "../components/BookedJobFlow";
import { ActivityTimeline } from "../components/ActivityTimeline";
import { CameraCaptureModal } from "../components/CameraCaptureModal";
import { useAuth } from "../hooks/useAuth";
import { canEdit } from "../config/permissions";
import { JOB_STATUS_FLOW } from "../config/jobCardWorkflow";
import { validatePrice } from "../utils/validators";

type TechnicianSummary = Pick<StaffUser, "id" | "name" | "email" | "role">;

export function JobCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [jobCard, setJobCard] = useState<JobCard | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianSummary[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [damageTypes, setDamageTypes] = useState<DamageType[]>([]);
  const [activityLog, setActivityLog] = useState<BookingActivityLogEntry[]>([]);
  const [needsAttention, setNeedsAttention] = useState(false);
  const [profit, setProfit] = useState<ProfitBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resettingMarkingId, setResettingMarkingId] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [editingInspection, setEditingInspection] = useState(false);

  const canSeeProfit = user && ["ADMIN", "MANAGER"].includes(user.role);

  async function load() {
    if (!id) return;
    setError(null);
    try {
      const [jc, techs, items, types] = await Promise.all([
        jobCardsApi.getJobCard(id),
        usersApi.listTechnicians(),
        inventoryApi.listInventoryItems(),
        damageTypesApi.listDamageTypes(),
      ]);
      setJobCard(jc);
      setTechnicians(techs);
      setInventoryItems(items);
      setDamageTypes(types);

      const [log, attention] = await Promise.all([
        bookingsApi.getBookingActivityLog(jc.bookingId),
        bookingsApi.getBookingsNeedingAttention().catch(() => []),
      ]);
      setActivityLog(log);
      setNeedsAttention(attention.some((b) => b.id === jc.bookingId));

      if (canSeeProfit) {
        jobCardsApi.getJobCardProfit(id).then(setProfit).catch(() => setProfit(null));
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // React Router doesn't auto-scroll to a #hash on client-side navigation
  // (only the browser's native full-page-load behavior does) — needed so
  // a "View" link from the Bookings page actually lands on the Damage
  // Inspection section instead of just the page top.
  useEffect(() => {
    if (!jobCard || !location.hash) return;
    const el = document.querySelector(location.hash);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [jobCard, location.hash]);

  if (error) return <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>;
  if (!jobCard) return <div className="text-neutral-500">Loading...</div>;

  // One damage inspection per job card (see backend createDamageInspection).
  const inspection = jobCard.damageInspections[0];
  // Technician assignment, damage inspection, and photos are Job Board
  // edit actions; generating an invoice is an Invoices & Payments one —
  // two different sections, so two different checks (previously a
  // single canManage that incorrectly excluded TECHNICIAN and included
  // RECEPTIONIST for the Job Board actions).
  const canEditJobBoard = user && canEdit(user.role, "jobBoard");
  const canEditInvoices = user && canEdit(user.role, "invoicesPayments");
  const owner = jobCard.booking.currentOwner;
  const ownerRole = jobCard.booking.currentOwnerRole;
  // Same status pipeline the Job Board/Daily Jobs Kanban drives its
  // column buttons from (JOB_STATUS_FLOW) — this page and the board are
  // one workflow now, not two: advancing a job's status works from
  // wherever staff happen to be looking at it.
  const currentStep = JOB_STATUS_FLOW.find((s) => s.status === jobCard.status);

  async function handleAdvance(next: BookingStatus) {
    if (!id) return;
    // Starting a job (CONFIRMED -> IN_PROGRESS) needs someone assigned —
    // the Job Board enforces this via its "Start Job" modal; here the
    // Assigned Technicians section is right above, so just point at it.
    if (jobCard!.status === "CONFIRMED" && jobCard!.technicians.length === 0) {
      setError("Assign at least one technician above before starting the job");
      return;
    }
    setAdvancing(true);
    setError(null);
    try {
      await bookingsApi.updateBookingStatus(jobCard!.bookingId, next);
      setNotice(`Moved to ${next.replace(/_/g, " ")}`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setAdvancing(false);
    }
  }

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

  async function handleSaveInspection(markings: NewMarkingDraft[]): Promise<boolean> {
    if (!id) return false;
    setError(null);
    try {
      await jobCardsApi.createDamageInspection(id, "PRE_SERVICE", markings);
      setNotice("Damage inspection saved");
      load();
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }

  // The customer's own approve/decline (via the portal) is the only way
  // an offer gets decided — staff can only reset a decided one back to
  // PENDING if a correction is genuinely needed.
  async function handleResetMarking(markingId: string) {
    setError(null);
    setResettingMarkingId(markingId);
    try {
      await jobCardsApi.resetDamageMarking(markingId);
      setNotice("Decision reset — the customer can be asked again");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setResettingMarkingId(null);
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

  async function handleSendPhotoWhatsApp(photoId: string) {
    if (!id) return;
    setError(null);
    try {
      await jobCardsApi.sendPhotoWhatsApp(id, photoId);
      setNotice("Photo sent to customer over WhatsApp");
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

  async function handleExternalInventoryUsage(name: string, unitCost: number, quantity: number) {
    if (!id) return;
    setError(null);
    try {
      await jobCardsApi.recordExternalInventoryUsage(id, name, unitCost, quantity);
      setNotice("External purchase recorded — added to the invoice");
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

  // A walk-in's job card lives on the Daily Jobs board, not the Job
  // Board — link back to wherever this job card actually appears.
  const isWalkIn = jobCard.booking.isWalkIn;
  // Picks which category 3D model DamageInspectionDiagram shows (see
  // config/vehicleModels.ts) — every VehicleType has a dedicated entry,
  // so this is never a fallback guess.
  const vehicleType = jobCard.booking.vehicle?.vehicleType ?? "SEDAN";

  const editInspectionButton = inspection && canEditJobBoard && !editingInspection && (
    <button
      onClick={() => setEditingInspection(true)}
      className="rounded-md px-3 py-1.5 text-xs font-medium text-neutral-200 ring-1 ring-neutral-700 hover:bg-black"
    >
      ✎ Edit inspection
    </button>
  );

  // The inspection editor / viewer — inside step 3 of the booked-job flow
  // (where steps 4–5 show the customer approval), or as its own section
  // with the approval panel beside it for walk-ins.
  const renderInspection = (withApproval: boolean) =>
    (!inspection || editingInspection) && canEditJobBoard ? (
      <>
        {inspection?.customerAcknowledged && (
          <div className="mb-3 rounded-md bg-yellow-950/40 px-3 py-2 text-xs text-yellow-300">
            The customer already confirmed this inspection. If you change it, they'll need to confirm the updated
            report again (repairs you don't change keep their decision).
          </div>
        )}
        <DamageInspectionEditor
          key={inspection?.id ?? "new"}
          damageTypes={damageTypes}
          vehicleType={vehicleType}
          // Extra work found mid-job (flow step 8) is managed there, not here.
          initial={inspection?.markings.filter((m) => !m.foundDuringWork)}
          onSave={async (markings) => {
            if (await handleSaveInspection(markings)) setEditingInspection(false);
          }}
          onCancel={inspection ? () => setEditingInspection(false) : undefined}
        />
      </>
    ) : inspection ? (
      <div className={withApproval ? "grid gap-6 lg:grid-cols-[3fr_2fr]" : ""}>
        <div>
          {inspection.inspectedByUser && (
            <p className="mb-2 text-xs text-neutral-500">
              Inspected by {inspection.inspectedByUser.name} on {new Date(inspection.createdAt).toLocaleDateString()}
            </p>
          )}
          {inspection.markings.length === 0 && (
            <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-green-950 px-3 py-1 text-xs font-semibold text-green-400">
              ✓ No damage found
            </div>
          )}
          <DamageInspectionDiagram
            vehicleType={vehicleType}
            markings={inspection.markings}
            onReset={canEditJobBoard ? handleResetMarking : undefined}
            resettingId={resettingMarkingId}
          />
        </div>
        {withApproval && (
          <div>
            <InspectionApprovalSteps
              inspection={inspection}
              jobCardId={jobCard.id}
              customerPhone={jobCard.booking.customer?.phone}
              canEdit={!!canEditJobBoard}
              onChanged={load}
            />
          </div>
        )}
      </div>
    ) : (
      <div className="text-sm text-neutral-500">No damage inspection recorded yet.</div>
    );

  return (
    <div>
      <Link
        to={isWalkIn ? "/daily-jobs" : "/job-board"}
        className="mb-4 inline-block text-sm text-neutral-400 hover:underline"
      >
        ← Back to {isWalkIn ? "Daily Jobs" : "Booking Job Board"}
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <div>
          <h1 className="text-xl font-semibold text-white">
            {jobCard.booking.vehicle?.plateNumber} — {jobCard.booking.vehicle?.make} {jobCard.booking.vehicle?.model}
          </h1>
          <div className="text-sm text-neutral-400">
            {jobCard.booking.customer?.name}
            {jobCard.booking.vehicle && <> · {vehicleTypeLabel(jobCard.booking.vehicle.vehicleType)}</>}
            {jobCard.booking.mileage != null && <> · Mileage in: {formatMileage(jobCard.booking.mileage)}</>}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {owner
              ? `Owner: ${owner.name} (${owner.role})`
              : ownerRole
                ? `Unclaimed — needs ${ownerRole}`
                : "No owner for this status"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {needsAttention && (
            <span className="rounded-full bg-red-950 px-2.5 py-0.5 text-xs font-medium text-red-400">
              Needs Attention
            </span>
          )}
          <StatusBadge status={jobCard.status} />
          {/* Booked jobs move forward from the step flow below. */}
          {isWalkIn && canEditJobBoard && currentStep?.next && (
            <button
              onClick={() => handleAdvance(currentStep.next!)}
              disabled={advancing}
              className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {advancing ? "..." : currentStep.nextLabel}
            </button>
          )}
        </div>
      </div>

      {notice && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{notice}</div>}
      {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}

      {!isWalkIn && (
        <BookedJobFlow
          jobCard={jobCard}
          canAct={!!canEditJobBoard}
          canBill={!!canEditInvoices}
          damageTypes={damageTypes}
          onChanged={load}
          inspectionSlot={
            <div id="damage-inspection" className="scroll-mt-4">
              {editInspectionButton && <div className="mb-3">{editInspectionButton}</div>}
              {renderInspection(false)}
            </div>
          }
        />
      )}

      <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase text-neutral-400">Timeline</h2>
        <ActivityTimeline entries={activityLog} />
      </div>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">Booked Services</h2>
          <ul className="space-y-1 text-sm">
            {jobCard.booking.services?.map((s) => (
              <li key={s.id} className="flex justify-between text-neutral-300">
                <span>{s.service?.name ?? s.package?.name}</span>
                <span>{formatMoney(s.price)}</span>
              </li>
            ))}
          </ul>
          {jobCard.estimate && (
            <div className="mt-4 rounded-md bg-black/40 px-3 py-2 text-xs text-neutral-300 ring-1 ring-neutral-800">
              <div className="flex justify-between">
                <span>⏱ Estimated time</span>
                <span className="font-semibold text-white">{formatMinutes(jobCard.estimate.totalMinutes)}</span>
              </div>
              <div className="mt-1 text-neutral-500">
                Services {formatMinutes(jobCard.estimate.serviceMinutes)}
                {jobCard.estimate.repairMinutes > 0 && <> + damage repairs {formatMinutes(jobCard.estimate.repairMinutes)}</>}
                {" · "}
                {jobCard.startedAt ? "should finish" : "if started on time, finishes"} around{" "}
                {new Date(jobCard.estimate.finishBy).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          )}
        </div>

        <TechnicianAssignment
          technicians={technicians}
          assignedIds={jobCard.technicians.map((t) => t.userId)}
          disabled={!canEditJobBoard}
          onAssign={handleAssign}
        />
      </div>

      {isWalkIn && (
        <div id="damage-inspection" className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5 scroll-mt-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase text-neutral-400">Damage Inspection</h2>
            {editInspectionButton}
          </div>
          {renderInspection(true)}
        </div>
      )}

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <PhotoSection
          jobCard={jobCard}
          onUpload={handlePhotoUpload}
          onSendWhatsApp={handleSendPhotoWhatsApp}
          canEdit={!!canEditJobBoard}
        />
        {isWalkIn && (
          <InventoryUsageSection
            items={inventoryItems}
            onUse={handleInventoryUsage}
            onUseExternal={handleExternalInventoryUsage}
            canEdit={!!canEditJobBoard}
          />
        )}
      </div>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        {isWalkIn && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">Invoice</h2>
          {jobCard.invoice ? (
            <Link to={`/invoices/${jobCard.invoice.id}`} className="text-sm text-neutral-200 hover:underline">
              View invoice — {formatMoney(jobCard.invoice.total)} ({jobCard.invoice.status})
            </Link>
          ) : canEditInvoices ? (
            <button
              onClick={handleCreateInvoice}
              className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Generate Invoice
            </button>
          ) : (
            <div className="text-sm text-neutral-500">No invoice yet.</div>
          )}
        </div>
        )}

        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">Customer Satisfaction</h2>
          {jobCard.review ? (
            <div>
              <div className="mb-1 text-red-300">{"★".repeat(jobCard.review.rating)}{"☆".repeat(5 - jobCard.review.rating)}</div>
              {jobCard.review.comment && <div className="text-sm text-neutral-300">"{jobCard.review.comment}"</div>}
            </div>
          ) : (
            <div className="text-sm text-neutral-500">No review yet.</div>
          )}
        </div>
      </div>

      {canSeeProfit && profit && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">Profit Breakdown</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs uppercase text-neutral-500">Revenue</div>{formatMoney(profit.revenue)}
            </div>
            <div>
              <div className="text-xs uppercase text-neutral-500">Material Cost</div>−{formatMoney(profit.materialCost)}
            </div>
            <div>
              <div className="text-xs uppercase text-neutral-500">Labor Cost</div>−{formatMoney(profit.laborCost)}
            </div>
            <div>
              <div className="text-xs uppercase text-neutral-500">Profit</div>
              <span className={`font-semibold ${profit.profit >= 0 ? "text-red-400" : "text-red-600"}`}>
                {formatMoney(profit.profit)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TechnicianAssignment({
  technicians,
  assignedIds,
  disabled,
  onAssign,
}: {
  technicians: TechnicianSummary[];
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
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">Assigned Technicians</h2>
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
          className="mt-3 rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
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
  onSendWhatsApp,
  canEdit,
}: {
  jobCard: JobCard;
  onUpload: (file: File, type: PhotoType) => void;
  onSendWhatsApp: (photoId: string) => Promise<void>;
  canEdit: boolean;
}) {
  const before = jobCard.photos.filter((p) => p.type === "BEFORE");
  const after = jobCard.photos.filter((p) => p.type === "AFTER");
  const progress = jobCard.photos.filter((p) => p.type === "PROGRESS");
  const [sendingId, setSendingId] = useState<string | null>(null);

  async function handleSend(photoId: string) {
    setSendingId(photoId);
    try {
      await onSendWhatsApp(photoId);
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">Photos</h2>
      <div className={`grid grid-cols-1 gap-3 ${progress.length > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <PhotoUploadColumn
          label="Before"
          photos={before}
          onUpload={(f) => onUpload(f, "BEFORE")}
          onSend={handleSend}
          sendingId={sendingId}
          canEdit={canEdit}
        />
        <PhotoUploadColumn
          label="After"
          photos={after}
          onUpload={(f) => onUpload(f, "AFTER")}
          onSend={handleSend}
          sendingId={sendingId}
          canEdit={canEdit}
        />
        {/* Work-in-progress photos sent from the Daily Jobs / Job Board
            cards — shown here so the full history is in one place. */}
        {progress.length > 0 && (
          <PhotoUploadColumn
            label="Progress"
            photos={progress}
            onUpload={(f) => onUpload(f, "PROGRESS")}
            onSend={handleSend}
            sendingId={sendingId}
            canEdit={canEdit}
          />
        )}
      </div>
    </div>
  );
}

function PhotoUploadColumn({
  label,
  photos,
  onUpload,
  onSend,
  sendingId,
  canEdit,
}: {
  label: string;
  photos: { id: string; url: string }[];
  onUpload: (file: File) => void;
  onSend: (photoId: string) => void;
  sendingId: string | null;
  canEdit: boolean;
}) {
  const [cameraOpen, setCameraOpen] = useState(false);

  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase text-neutral-500">{label}</div>
      <div className="mb-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {photos.map((p) => (
          <div key={p.id} className="space-y-1">
            <a href={`${API_URL}${p.url}`} target="_blank" rel="noreferrer">
              <img src={`${API_URL}${p.url}`} className="h-16 w-full rounded object-cover" alt={label} />
            </a>
            {canEdit && (
              <button
                onClick={() => onSend(p.id)}
                disabled={sendingId === p.id}
                className="w-full rounded bg-red-950 px-1 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-950 disabled:opacity-50"
              >
                {sendingId === p.id ? "Sending..." : "Send WhatsApp"}
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="flex gap-1.5">
          {/* Camera opens a live getUserMedia preview — works for a phone's
              camera AND a laptop's webcam, unlike <input capture> which
              most desktop browsers just ignore. File is the plain
              file/gallery picker. */}
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="flex-1 rounded-md border border-neutral-700 px-2 py-1 text-center text-xs text-neutral-300 hover:bg-black"
          >
            📷 Camera
          </button>
          <label className="flex-1 cursor-pointer rounded-md border border-neutral-700 px-2 py-1 text-center text-xs text-neutral-300 hover:bg-black">
            🖼️ File
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = "";
              }}
              className="sr-only"
            />
          </label>
        </div>
      )}
      {cameraOpen && (
        <CameraCaptureModal
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => {
            setCameraOpen(false);
            onUpload(file);
          }}
        />
      )}
    </div>
  );
}

/** Creates the inspection, or edits the saved one in place (`initial` = its current markers). */
function DamageInspectionEditor({
  damageTypes,
  vehicleType,
  initial,
  onSave,
  onCancel,
}: {
  damageTypes: DamageType[];
  vehicleType: VehicleType;
  initial?: DamageMarking[];
  onSave: (markings: NewMarkingDraft[]) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const isEdit = !!initial;
  const [draft, setDraft] = useState<NewMarkingDraft[]>(() =>
    (initial ?? []).map((m) => ({
      id: m.id,
      x: m.x ?? 0,
      y: m.y ?? 0,
      z: m.z ?? 0,
      damageTypeId: m.damageTypeId ?? undefined,
      note: m.note ?? undefined,
      suggestedPrice: m.suggestedPrice != null ? Number(m.suggestedPrice) : undefined,
      isAdditionalRepairOffer: m.isAdditionalRepairOffer,
      severity: m.severity ?? "MINOR",
      photoUrl: m.photoUrl ?? undefined,
    })),
  );
  const [saving, setSaving] = useState(false);
  const savedById = new Map((initial ?? []).map((m) => [m.id, m]));

  async function save(markings: NewMarkingDraft[]) {
    setSaving(true);
    try {
      await onSave(markings);
    } finally {
      setSaving(false);
    }
  }

  // The diagram's display list wants the saved-record shape (id,
  // approvalStatus, etc.) — synthesize a local preview of those fields
  // for markings that don't exist in the database yet. A saved marker
  // whose repair offer is unchanged keeps showing the customer's decision.
  const previewMarkings: DamageMarking[] = draft.map((m, idx) => {
    const saved = m.id ? savedById.get(m.id) : undefined;
    const offerUnchanged =
      saved &&
      saved.isAdditionalRepairOffer === m.isAdditionalRepairOffer &&
      Number(saved.suggestedPrice ?? 0) === Number(m.isAdditionalRepairOffer ? m.suggestedPrice ?? 0 : 0);
    return {
    id: m.id ?? `draft-${idx}`,
    damageInspectionId: "",
    view: "FRONT",
    x: m.x,
    y: m.y,
    z: m.z,
    damageTypeId: m.damageTypeId ?? null,
    damageType: damageTypes.find((t) => t.id === m.damageTypeId) ?? null,
    note: m.note ?? null,
    suggestedPrice: m.isAdditionalRepairOffer ? String(m.suggestedPrice ?? 0) : null,
    isAdditionalRepairOffer: m.isAdditionalRepairOffer,
    approvalStatus: offerUnchanged ? saved.approvalStatus : m.isAdditionalRepairOffer ? "PENDING" : "NOT_APPLICABLE",
    severity: m.severity,
    photoUrl: m.photoUrl ?? null,
    createdAt: saved?.createdAt ?? new Date().toISOString(),
    decidedAt: offerUnchanged ? saved.decidedAt : null,
    };
  });

  return (
    <div>
      <DamageInspectionDiagram
        markings={previewMarkings}
        editable
        damageTypes={damageTypes}
        vehicleType={vehicleType}
        onAddMarking={(m) => setDraft((prev) => [...prev, m])}
        // Keep the saved id so the backend updates that marker instead of creating a new one.
        onEditMarking={(idx, m) => setDraft((prev) => prev.map((d, i) => (i === idx ? { ...m, id: d.id } : d)))}
        onRemoveMarking={(idx) => setDraft((prev) => prev.filter((_, i) => i !== idx))}
        onUploadPhoto={async (file) => {
          const { url } = await jobCardsApi.uploadDamagePhoto(file);
          return url;
        }}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => save(draft)}
          disabled={saving || (draft.length === 0 && !isEdit)}
          className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : draft.length === 0
              ? "Save as No damage"
              : `${isEdit ? "Save changes" : "Save Inspection"} (${draft.length} marker${draft.length === 1 ? "" : "s"})`}
        </button>
        {draft.length === 0 && !isEdit && (
          // Records the inspection as done with zero markings — the
          // vehicle was checked and is clean, which is different from
          // "not inspected yet".
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (window.confirm("Record this inspection as \"No damage found\"?")) save([]);
            }}
            className="rounded-full bg-green-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
          >
            ✓ No damage
          </button>
        )}
        {draft.length > 0 && !isEdit && (
          <button
            type="button"
            onClick={() => setDraft([])}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-black"
          >
            Clear
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-black"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function InventoryUsageSection({
  items,
  onUse,
  onUseExternal,
  canEdit,
}: {
  items: InventoryItem[];
  onUse: (itemId: string, quantity: number) => void;
  onUseExternal: (name: string, unitCost: number, quantity: number) => void;
  canEdit: boolean;
}) {
  const [mode, setMode] = useState<"STOCK" | "EXTERNAL">("STOCK");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [externalName, setExternalName] = useState("");
  const [externalUnitCost, setExternalUnitCost] = useState(0);
  const [priceError, setPriceError] = useState<string | null>(null);

  const selectedItem = items.find((i) => i.id === itemId);
  // Surfaced proactively, client-side, the moment the requested quantity
  // would exceed on-hand stock — Phase D wants this caught before the
  // server round-trip, not just as an error after a failed submit.
  const exceedsStock = !!selectedItem && quantity > Number(selectedItem.quantityInStock);

  function switchToExternal() {
    setExternalName(selectedItem?.name ?? "");
    setMode("EXTERNAL");
  }

  function handleUseExternal() {
    setPriceError(null);
    if (!externalName.trim()) return;
    const err = validatePrice(String(externalUnitCost));
    if (err) {
      setPriceError(err);
      return;
    }
    onUseExternal(externalName.trim(), externalUnitCost, quantity);
    setExternalName("");
    setExternalUnitCost(0);
    setQuantity(1);
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">Inventory Used</h2>
      {canEdit ? (
        <div>
          <div className="mb-2 flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setMode("STOCK")}
              className={`rounded-full px-3 py-1 font-medium ${
                mode === "STOCK" ? "bg-black text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              From Stock
            </button>
            <button
              type="button"
              onClick={() => setMode("EXTERNAL")}
              className={`rounded-full px-3 py-1 font-medium ${
                mode === "EXTERNAL" ? "bg-black text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              Bought Externally
            </button>
          </div>

          {mode === "STOCK" ? (
            <div>
              <div className="flex gap-2">
                <select
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  className="flex-1 rounded-md border border-neutral-700 px-2 py-1.5 text-sm"
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
                  className="w-20 rounded-md border border-neutral-700 px-2 py-1.5 text-sm"
                />
                <button
                  onClick={() => itemId && onUse(itemId, quantity)}
                  disabled={!itemId || exceedsStock}
                  className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  Use
                </button>
              </div>
              {exceedsStock && (
                <div className="mt-2 rounded-md bg-red-950 px-3 py-2 text-xs text-red-300">
                  Only {selectedItem?.quantityInStock} {selectedItem?.unit} of {selectedItem?.name} left — not enough
                  for this job.{" "}
                  <button type="button" onClick={switchToExternal} className="font-medium underline">
                    Record as an external purchase instead
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="mb-2 text-xs text-neutral-500">
                Not enough in stock — record what was bought outside. Its cost is added straight to the customer's
                invoice.
              </p>
              <div className="flex gap-2">
                <input
                  value={externalName}
                  onChange={(e) => setExternalName(e.target.value)}
                  placeholder="Part name"
                  className="flex-1 rounded-md border border-neutral-700 px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  placeholder="Qty"
                  className="w-16 rounded-md border border-neutral-700 px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={externalUnitCost}
                  onChange={(e) => setExternalUnitCost(Number(e.target.value))}
                  placeholder="Unit cost (Rs.)"
                  className="w-28 rounded-md border border-neutral-700 px-2 py-1.5 text-sm"
                />
                <button
                  onClick={handleUseExternal}
                  disabled={!externalName.trim()}
                  className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              {priceError && <div className="mt-1 text-xs text-red-600">{priceError}</div>}
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-neutral-500">View only.</div>
      )}
    </div>
  );
}
