import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import * as jobFlowApi from "../api/jobFlow";
import type { FlowBay } from "../api/jobFlow";
import * as bookingsApi from "../api/bookings";
import * as billingApi from "../api/billing";
import * as jobCardsApi from "../api/jobCards";
import { API_URL, apiErrorMessage } from "../api/client";
import type { BookingStatus, DamageType, Invoice, JobCard } from "../api/types";
import { DailyFlowStep, type FlowStepState } from "./DailyFlowStep";
import { DailyJobInventory } from "./DailyJobInventory";
import { DailyPayment } from "./DailyPayment";
import { InspectionApprovalSteps } from "./InspectionApprovalSteps";

const DEFAULT_COOLDOWN_MIN = 15;

const money = (v: string | number | null | undefined) =>
  `Rs. ${Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
/** "YYYY-MM-DDTHH:MM" in local time, for <input type="datetime-local">. */
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const btnPrimary = "rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50";
const btnGreen = "rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50";
const btnGhost = "rounded-md px-3 py-2 text-sm text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-800 disabled:opacity-50";

/**
 * The booked-job flow on the job card page — the Job Board's counterpart
 * to Daily Jobs' 10 steps, top to bottom:
 *   1 Bay · 2 Cool-down · 3 Damage inspection · 4 Inform customer ·
 *   5 Customer approval · 6 Lounge or leave + ready time · 7 Do the work
 *   (start, inventory) · 8 Extra work found mid-job · 9 Quality check →
 *   Ready · 10 Invoice · 11 Payment → Job completed.
 * Step 3's editor/viewer is passed in by the page (`inspectionSlot`).
 */
export function BookedJobFlow({
  jobCard,
  canAct,
  canBill,
  damageTypes,
  inspectionSlot,
  onChanged,
}: {
  jobCard: JobCard;
  canAct: boolean;
  canBill: boolean;
  damageTypes: DamageType[];
  inspectionSlot: ReactNode;
  onChanged: () => void | Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);

  const status = jobCard.status;
  const inspection = jobCard.damageInspections[0];
  const inspectionMarks = inspection?.markings.filter((m) => !m.foundDuringWork) ?? [];
  const extraWork = inspection?.markings.filter((m) => m.foundDuringWork) ?? [];
  const extraPending = extraWork.filter((m) => m.approvalStatus === "PENDING");
  const prePending = inspectionMarks.filter((m) => m.isAdditionalRepairOffer && m.approvalStatus === "PENDING");
  const started = status !== "CONFIRMED" && status !== "PENDING";
  const workDone = status === "READY" || status === "COMPLETED";

  const s1 = !!jobCard.bayCheckedInAt;
  const s2 = !!jobCard.cooldownDoneAt;
  const s3 = !!inspection;
  const noDamage = s3 && inspectionMarks.length === 0;
  const s5 = s3 && prePending.length === 0 && (noDamage || !!inspection.acknowledgedAt);
  const s4 = s5 || !!inspection?.sentToCustomerAt;
  const s6 = !!jobCard.promisedReadyAt;
  const s7 = started && status !== "IN_PROGRESS";
  const s9 = workDone;
  const isPaid = invoice?.status === "PAID";

  // Earlier steps can be skipped by a job that's already further along
  // (e.g. it was started before this flow existed) — never lock those.
  const st = (done: boolean, unlocked: boolean): FlowStepState => (done ? "done" : unlocked || started ? "active" : "locked");

  useEffect(() => {
    if (!jobCard.invoice) {
      setInvoice(null);
      return;
    }
    billingApi.getInvoice(jobCard.invoice.id).then(setInvoice).catch(() => setInvoice(null));
  }, [jobCard.invoice, jobCard.invoice?.id, jobCard.invoice?.total, jobCard.invoice?.status]);

  async function act(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice(success);
      await onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const move = (next: BookingStatus, success: string) => act(() => bookingsApi.updateBookingStatus(jobCard.bookingId, next), success);

  return (
    <div className="mb-8">
      <h2 className="mb-1 text-lg font-semibold text-white">Job steps</h2>
      <p className="mb-4 text-sm text-neutral-400">Work through the steps from top to bottom.</p>
      {notice && <div className="mb-3 rounded-md bg-green-950/50 px-3 py-2 text-sm text-green-300">{notice}</div>}
      {error && <div className="mb-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{error}</div>}

      {/* 1 — Bay */}
      <DailyFlowStep
        n={1}
        title="Bring the car into a free bay"
        state={st(s1, true)}
        summary={s1 ? `In ${jobCard.booking.bay?.name ?? "a bay"} since ${time(jobCard.bayCheckedInAt!)}.` : "Pick a free bay for this car."}
      >
        {canAct && !workDone && <BayPicker jobCard={jobCard} busy={busy} onPick={(id) => act(() => jobFlowApi.checkInBay(jobCard.id, id), "Car checked into the bay")} />}
      </DailyFlowStep>

      {/* 2 — Cool-down */}
      <DailyFlowStep
        n={2}
        title="Cool-down"
        state={st(s2, s1)}
        summary={
          s2
            ? jobCard.cooldownStartedAt
              ? `Cooled down ${jobCard.cooldownMinutes} min (done ${time(jobCard.cooldownDoneAt!)}).`
              : "Skipped."
            : "Let the engine and body cool before washing or polishing."
        }
      >
        {!s2 && canAct && (s1 || started) && (
          <Cooldown jobCard={jobCard} busy={busy} onStart={(m) => act(() => jobFlowApi.startCooldown(jobCard.id, m))} onDone={(msg) => act(() => jobFlowApi.finishCooldown(jobCard.id), msg)} />
        )}
      </DailyFlowStep>

      {/* 3 — Damage inspection */}
      <DailyFlowStep
        n={3}
        title="Damage inspection (with photos)"
        state={st(s3, s2)}
        summary={
          s3
            ? noDamage
              ? "✓ No damage found."
              : `${inspectionMarks.length} damage point${inspectionMarks.length === 1 ? "" : "s"} recorded.`
            : "Walk around the car. Click the 3D model where there's damage and add a close-up photo — or press “No damage”."
        }
      >
        {(s2 || s3 || started) && inspectionSlot}
      </DailyFlowStep>

      {/* 4 — Inform customer */}
      <DailyFlowStep
        n={4}
        title="Inform the customer"
        state={st(s4, s3)}
        summary={
          !s3
            ? "Available after the inspection."
            : inspection.sentToCustomerAt
              ? `Report sent on WhatsApp at ${time(inspection.sentToCustomerAt)}.`
              : s5
                ? "Customer confirmed."
                : "Send the report on WhatsApp, or open it on this device for a customer at the counter."
        }
      >
        {s3 && !s5 && (
          <InspectionApprovalSteps
            inspection={inspection}
            jobCardId={jobCard.id}
            customerPhone={jobCard.booking.customer?.phone}
            canEdit={canAct}
            onChanged={onChanged}
          />
        )}
      </DailyFlowStep>

      {/* 5 — Customer approval */}
      <DailyFlowStep
        n={5}
        title="Customer approval"
        state={st(s5, s4)}
        summary={
          !s3
            ? "Available after the inspection."
            : noDamage
              ? "No damage — no approval needed."
              : s5
                ? `✓ Confirmed${inspection.acknowledgedAt ? ` at ${time(inspection.acknowledgedAt)}` : ""}${inspection.customerComment ? ` — “${inspection.customerComment}”` : ""}.`
                : `⏳ Waiting for the customer${prePending.length > 0 ? ` to decide on ${prePending.length} repair${prePending.length === 1 ? "" : "s"}` : " to confirm the report"}. This updates by itself.`
        }
      >
        {s5 && inspectionMarks.some((m) => m.isAdditionalRepairOffer) && (
          <ul className="divide-y divide-neutral-800 rounded-md border border-neutral-800 text-sm">
            {inspectionMarks
              .filter((m) => m.isAdditionalRepairOffer)
              .map((m) => (
                <li key={m.id} className="flex justify-between px-3 py-1.5">
                  <span className="text-neutral-300">{m.damageType?.name ?? m.note ?? "Repair"}</span>
                  <span className={m.approvalStatus === "APPROVED" ? "text-green-400" : "text-neutral-500"}>
                    {m.approvalStatus === "APPROVED" ? `Approved · ${money(m.suggestedPrice)}` : "Declined"}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </DailyFlowStep>

      {/* 6 — Lounge or leave + ready time */}
      <DailyFlowStep
        n={6}
        title="Wait in the lounge or leave — tell the ready time"
        state={st(s6, s5)}
        summary={
          s6
            ? `${jobCard.customerWaiting === "LOUNGE" ? "Waiting in the lounge" : "Customer left"} · ready around ${new Date(jobCard.promisedReadyAt!).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}${jobCard.timingSentAt ? " · sent on WhatsApp" : ""}.`
            : "Ask the customer if they'll wait or come back, and give them a rough ready time."
        }
      >
        {canAct && (s5 || started) && !workDone && (
          <TimingForm jobCard={jobCard} busy={busy} onSave={(w, at, send) => act(() => jobFlowApi.sendTiming(jobCard.id, w, at, send), send ? "Ready time sent on WhatsApp" : "Ready time saved")} />
        )}
      </DailyFlowStep>

      {/* 7 — Do the work */}
      <DailyFlowStep
        n={7}
        title="Do the work — inventory used"
        state={st(s7, s6)}
        summary={
          status === "CONFIRMED"
            ? jobCard.technicians.length === 0
              ? "Assign technicians in “Assigned Technicians” below, then start the work."
              : `Technicians: ${jobCard.technicians.map((t) => t.user?.name).filter(Boolean).join(", ")}.`
            : status === "IN_PROGRESS"
              ? `Work started ${jobCard.startedAt ? time(jobCard.startedAt) : ""}. Add each material used, then send the car to quality check.`
              : `${jobCard.inventoryUsages?.length ?? 0} inventory item${jobCard.inventoryUsages?.length === 1 ? "" : "s"} recorded.`
        }
      >
        {canAct && status === "CONFIRMED" && (s6 || s5) && (
          <button
            onClick={() => {
              if (jobCard.technicians.length === 0) return setError("Assign at least one technician below before starting the work");
              move("IN_PROGRESS", "Work started — the customer was notified");
            }}
            disabled={busy}
            className={btnPrimary}
          >
            ▶ Start work
          </button>
        )}
        {status === "IN_PROGRESS" && (
          <div className="space-y-4">
            <DailyJobInventory jobCard={jobCard} canAct={canAct} onChanged={onChanged} />
            {canAct && (
              <button
                onClick={() => {
                  if (extraPending.length > 0 && !window.confirm("The customer hasn't answered the extra work yet (step 8). Send to quality check anyway?")) return;
                  move("QUALITY_CHECK", "Sent to quality check — the invoice was created");
                }}
                disabled={busy}
                className={btnPrimary}
              >
                Work finished → Quality check
              </button>
            )}
          </div>
        )}
      </DailyFlowStep>

      {/* 8 — Extra (emergency) work */}
      <DailyFlowStep
        n={8}
        title="Extra work found during the job (optional)"
        state={extraWork.length > 0 && extraPending.length === 0 ? "done" : status === "IN_PROGRESS" ? "active" : "locked"}
        summary={
          extraWork.length === 0
            ? status === "IN_PROGRESS"
              ? "Found something that needs fixing? Add it with a photo and price — the customer approves it on WhatsApp."
              : "Available while the work is in progress."
            : `${extraWork.length} extra job${extraWork.length === 1 ? "" : "s"}${extraPending.length > 0 ? ` · ${extraPending.length} waiting for the customer` : " · all answered"}.`
        }
      >
        {extraWork.length > 0 && (
          <ul className="mb-3 divide-y divide-neutral-800 rounded-md border border-neutral-800 text-sm">
            {extraWork.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                {m.photoUrl && <img src={`${API_URL}${m.photoUrl}`} alt="" className="h-10 w-10 rounded object-cover" />}
                <span className="min-w-0 flex-1 text-neutral-200">
                  {[m.damageType?.name, m.note].filter(Boolean).join(" — ")} · {money(m.suggestedPrice)}
                </span>
                <span
                  className={`text-xs ${m.approvalStatus === "APPROVED" ? "text-green-400" : m.approvalStatus === "DECLINED" ? "text-neutral-500" : "text-yellow-400"}`}
                >
                  {m.approvalStatus === "PENDING" ? "Waiting" : m.approvalStatus === "APPROVED" ? "Approved" : "Declined"}
                </span>
                {canAct && m.approvalStatus === "PENDING" && (
                  <button onClick={() => act(() => jobFlowApi.removeExtraWork(jobCard.id, m.id), "Extra work removed")} className="text-xs text-red-400 hover:underline">
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canAct && status === "IN_PROGRESS" && (
          <ExtraWorkForm
            jobCard={jobCard}
            damageTypes={damageTypes}
            onDone={async (msg, warn) => {
              setError(warn ?? null);
              setNotice(msg);
              await onChanged();
            }}
          />
        )}
        {extraPending.length > 0 && inspection && (
          <div className="mt-3">
            <InspectionApprovalSteps
              inspection={inspection}
              jobCardId={jobCard.id}
              customerPhone={jobCard.booking.customer?.phone}
              canEdit={canAct}
              onChanged={onChanged}
            />
          </div>
        )}
      </DailyFlowStep>

      {/* 9 — Quality check → Ready */}
      <DailyFlowStep
        n={9}
        title="Quality check → Ready (WhatsApp the customer)"
        state={s9 ? "done" : status === "QUALITY_CHECK" ? "active" : "locked"}
        summary={
          s9
            ? "✓ Passed quality check — the customer got a “ready for pickup” WhatsApp."
            : status === "QUALITY_CHECK"
              ? "Check the work. When it's right, mark it Ready — the customer gets a WhatsApp that their car is ready to collect."
              : "Available after the work is finished."
        }
      >
        {canAct && status === "QUALITY_CHECK" && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => move("READY", "Marked ready — the customer was WhatsApped and the bay is free")} disabled={busy} className={btnGreen}>
              ✓ Passed QC — mark Ready & notify
            </button>
          </div>
        )}
      </DailyFlowStep>

      {/* 10 — Invoice */}
      <DailyFlowStep
        n={10}
        title="Invoice"
        state={invoice ? "done" : status === "QUALITY_CHECK" || workDone ? "active" : "locked"}
        summary={
          invoice
            ? `Invoice INV-${String(invoice.invoiceNumber).padStart(6, "0")} — total ${money(invoice.total)}${invoice.status === "PAID" ? " · paid" : ""}.`
            : "The invoice is created automatically when the work goes to quality check."
        }
        action={
          invoice && (
            <Link to={`/invoices/${invoice.id}`} className="text-sm text-red-400 hover:underline">
              Open / print →
            </Link>
          )
        }
      >
        {!invoice && canBill && (status === "QUALITY_CHECK" || workDone) && (
          <button onClick={() => act(() => billingApi.createInvoice(jobCard.id), "Invoice created")} disabled={busy} className={btnGhost}>
            Create invoice now
          </button>
        )}
      </DailyFlowStep>

      {/* 11 — Payment */}
      <DailyFlowStep
        n={11}
        title="Payment — cash, QR or bank transfer"
        state={!invoice ? "locked" : isPaid ? "done" : "active"}
        last
        summary={!invoice ? "Available once the job has an invoice." : isPaid ? "✓ Paid in full." : "Take the payment by cash, QR or bank transfer."}
      >
        {invoice && !isPaid && (
          <DailyPayment
            invoice={invoice}
            canBill={canBill}
            onPaid={async (msg) => {
              setNotice(msg);
              await onChanged();
            }}
          />
        )}
      </DailyFlowStep>

      <div
        className={`mt-6 ml-[52px] flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${
          status === "COMPLETED" ? "border-green-800 bg-green-950/30" : isPaid && workDone ? "border-green-700 bg-neutral-900" : "border-neutral-800 bg-neutral-900/60"
        }`}
      >
        <span className="text-sm">
          {status === "COMPLETED" ? (
            <span className="font-semibold text-green-400">✓ Job completed — handed over to {jobCard.booking.customer?.name}.</span>
          ) : !workDone ? (
            <span className="text-neutral-500">Job completed unlocks once the car is Ready (step 9).</span>
          ) : !isPaid ? (
            <span className="text-yellow-400">Ready — take the payment (step 11), then hand the car over.</span>
          ) : (
            <span className="text-neutral-200">Paid in full. Hand the car over and press Job completed.</span>
          )}
        </span>
        {status !== "COMPLETED" && (
          <button
            onClick={() => move("COMPLETED", "Job completed")}
            disabled={busy || status !== "READY" || !canBill}
            className="rounded-md bg-green-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            ✓ Job completed
          </button>
        )}
      </div>
    </div>
  );
}

function BayPicker({ jobCard, busy, onPick }: { jobCard: JobCard; busy: boolean; onPick: (bayId: string) => void }) {
  const [bays, setBays] = useState<FlowBay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checkedIn = !!jobCard.bayCheckedInAt;
  const [open, setOpen] = useState(!checkedIn);

  useEffect(() => {
    if (!open) return;
    jobFlowApi.listBays().then(setBays).catch((err) => setError(apiErrorMessage(err)));
  }, [open, jobCard.bayCheckedInAt, jobCard.booking.bayId]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-neutral-400 underline hover:text-neutral-200">
        Move to another bay
      </button>
    );
  }
  if (error) return <div className="text-sm text-red-400">{error}</div>;
  if (!bays) return <div className="text-sm text-neutral-500">Loading bays…</div>;
  if (bays.length === 0) return <div className="text-sm text-neutral-500">No bays set up — add them in Catalog.</div>;

  return (
    <div className="flex flex-wrap gap-2">
      {bays.map((b) => {
        const mine = b.occupiedBy?.jobCardId === jobCard.id || (checkedIn && jobCard.booking.bayId === b.id);
        const busyBay = !!b.occupiedBy && !mine;
        const blocked = busyBay || b.status === "MAINTENANCE";
        return (
          <button
            key={b.id}
            onClick={() => {
              onPick(b.id);
              if (checkedIn) setOpen(false);
            }}
            disabled={busy || blocked || mine}
            className={`min-w-28 rounded-lg px-4 py-3 text-left text-sm ring-1 disabled:cursor-not-allowed ${
              mine
                ? "bg-red-600 text-white ring-red-600"
                : blocked
                  ? "bg-neutral-900 text-neutral-500 ring-neutral-800"
                  : "bg-black text-white ring-green-700 hover:bg-green-950"
            }`}
          >
            <div className="font-semibold">{b.name}</div>
            <div className="text-xs">
              {mine ? "This car" : b.status === "MAINTENANCE" ? "Maintenance" : busyBay ? `Busy · ${b.occupiedBy!.plateNumber}` : jobCard.booking.bayId === b.id ? "Free · booked bay" : "Free"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Cooldown({
  jobCard,
  busy,
  onStart,
  onDone,
}: {
  jobCard: JobCard;
  busy: boolean;
  onStart: (minutes: number) => void;
  onDone: (msg: string) => void;
}) {
  const [minutes, setMinutes] = useState(String(DEFAULT_COOLDOWN_MIN));
  const [now, setNow] = useState(Date.now());
  const firedRef = useRef(false);
  const started = jobCard.cooldownStartedAt ? new Date(jobCard.cooldownStartedAt).getTime() : null;
  const endsAt = started && jobCard.cooldownMinutes ? started + jobCard.cooldownMinutes * 60_000 : null;
  const left = endsAt ? Math.max(0, endsAt - now) : null;

  useEffect(() => {
    if (!endsAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [endsAt]);

  // Finish automatically when the timer runs out (once).
  useEffect(() => {
    if (left === 0 && !firedRef.current) {
      firedRef.current = true;
      onDone("Cool-down finished");
    }
  }, [left, onDone]);

  if (endsAt && left != null) {
    const mm = Math.floor(left / 60_000);
    const ss = Math.floor((left % 60_000) / 1000);
    return (
      <div className="flex flex-wrap items-center gap-4">
        <div className="font-mono text-4xl font-semibold tabular-nums text-white">
          {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
        </div>
        <div className="text-sm text-neutral-400">cooling down… (ends {new Date(endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})</div>
        <button onClick={() => onDone("Cool-down ended early")} disabled={busy} className={btnGhost}>
          It's cool — continue
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm text-neutral-300">
        Minutes
        <input
          type="number"
          min={1}
          max={120}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="ml-2 w-20 rounded-md border border-neutral-700 bg-black px-2 py-1.5 text-sm"
        />
      </label>
      <button onClick={() => onStart(Math.min(120, Math.max(1, Number(minutes) || DEFAULT_COOLDOWN_MIN)))} disabled={busy} className={btnPrimary}>
        Start cool-down
      </button>
      <button onClick={() => onDone("Cool-down skipped")} disabled={busy} className={btnGhost}>
        Skip — engine is cold
      </button>
    </div>
  );
}

function TimingForm({
  jobCard,
  busy,
  onSave,
}: {
  jobCard: JobCard;
  busy: boolean;
  onSave: (waiting: "LOUNGE" | "LEAVE", readyAt: Date, send: boolean) => void;
}) {
  // Suggested: now + the job's estimated time (services + approved repairs).
  const suggested = () => new Date(Date.now() + (jobCard.estimate?.totalMinutes ?? 60) * 60_000);
  const [waiting, setWaiting] = useState<"LOUNGE" | "LEAVE">(jobCard.customerWaiting ?? "LOUNGE");
  const [readyAt, setReadyAt] = useState(toLocalInput(jobCard.promisedReadyAt ? new Date(jobCard.promisedReadyAt) : suggested()));
  const hasPhone = !!jobCard.booking.customer?.phone;
  const [send, setSend] = useState(hasPhone);

  return (
    <div className="space-y-3">
      <div className="grid max-w-md grid-cols-2 gap-2">
        {(["LOUNGE", "LEAVE"] as const).map((w) => (
          <button
            key={w}
            onClick={() => setWaiting(w)}
            className={`rounded-lg px-3 py-3 text-sm font-medium ring-1 ${waiting === w ? "bg-red-600 text-white ring-red-600" : "text-neutral-300 ring-neutral-700 hover:bg-neutral-800"}`}
          >
            {w === "LOUNGE" ? "🛋 Waits in the lounge" : "🚶 Leaves, comes back"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-neutral-300">
          Ready around
          <input
            type="datetime-local"
            value={readyAt}
            onChange={(e) => setReadyAt(e.target.value)}
            className="mt-1 block rounded-md border border-neutral-700 bg-black px-2 py-1.5 text-sm"
          />
        </label>
        <button onClick={() => setReadyAt(toLocalInput(suggested()))} className="pb-2 text-xs text-neutral-400 underline hover:text-neutral-200">
          Use estimate ({jobCard.estimate ? `${jobCard.estimate.totalMinutes} min` : "1 h"})
        </button>
      </div>
      <label className={`flex items-center gap-2 text-sm ${hasPhone ? "text-neutral-200" : "text-neutral-500"}`}>
        <input type="checkbox" checked={send} disabled={!hasPhone} onChange={(e) => setSend(e.target.checked)} className="h-4 w-4 accent-red-600" />
        Send it on WhatsApp{hasPhone ? ` (${jobCard.booking.customer?.phone})` : " — no phone number on file"}
      </label>
      <button onClick={() => onSave(waiting, new Date(readyAt), send)} disabled={busy || !readyAt} className={btnPrimary}>
        {send ? "Send to customer" : "Save"}
      </button>
    </div>
  );
}

function ExtraWorkForm({
  jobCard,
  damageTypes,
  onDone,
}: {
  jobCard: JobCard;
  damageTypes: DamageType[];
  onDone: (msg: string, warning?: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const hasPhone = !!jobCard.booking.customer?.phone;
  const [send, setSend] = useState(hasPhone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      setPhotoUrl((await jobCardsApi.uploadDamagePhoto(file)).url);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!typeId && !note.trim()) return setError("Pick a type or describe the work");
    const p = Number(price);
    if (!price || Number.isNaN(p) || p < 0) return setError("Enter the price");
    setSaving(true);
    setError(null);
    try {
      const r = await jobFlowApi.addExtraWork(jobCard.id, { damageTypeId: typeId || undefined, note: note.trim() || undefined, price: p, photoUrl, send });
      setOpen(false);
      setTypeId("");
      setNote("");
      setPrice("");
      setPhotoUrl(undefined);
      if (!r.sent && !r.warning) {
        try {
          await navigator.clipboard.writeText(r.url);
        } catch {
          /* ignore */
        }
      }
      await onDone(r.sent ? "Extra work sent to the customer on WhatsApp" : "Extra work saved — approval link copied", r.warning);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={btnGhost}>
        + Add extra work
      </button>
    );
  }

  const input = "w-full rounded-md border border-neutral-700 bg-black px-2 py-1.5 text-sm";
  return (
    <form onSubmit={submit} className="max-w-lg space-y-2 rounded-md border border-neutral-800 p-3">
      <select
        value={typeId}
        onChange={(e) => {
          setTypeId(e.target.value);
          const t = damageTypes.find((d) => d.id === e.target.value);
          if (t) setPrice(String(t.defaultPrice));
        }}
        className={input}
      >
        <option value="">— type (optional) —</option>
        {damageTypes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({money(t.defaultPrice)})
          </option>
        ))}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="What did you find? e.g. brake pad worn out" className={input} />
      <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="Price (Rs.)" className={input} />
      <div className="flex items-center gap-3 text-sm">
        <label className={btnGhost + " cursor-pointer"}>
          {uploading ? "Uploading…" : photoUrl ? "Change photo" : "📷 Add photo"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {photoUrl && <img src={`${API_URL}${photoUrl}`} alt="" className="h-10 w-10 rounded object-cover" />}
      </div>
      <label className={`flex items-center gap-2 text-sm ${hasPhone ? "text-neutral-200" : "text-neutral-500"}`}>
        <input type="checkbox" checked={send} disabled={!hasPhone} onChange={(e) => setSend(e.target.checked)} className="h-4 w-4 accent-red-600" />
        WhatsApp the customer for approval{hasPhone ? "" : " — no phone number on file (the link will be copied)"}
      </label>
      {error && <div className="text-sm text-red-400">{error}</div>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving || uploading} className={btnPrimary}>
          {saving ? "Saving…" : send ? "Send for approval" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
          Cancel
        </button>
      </div>
    </form>
  );
}
