import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useSearchParams } from "react-router-dom";
import * as jobCardsApi from "../api/jobCards";
import * as billingApi from "../api/billing";
import * as bookingsApi from "../api/bookings";
import type { Invoice, JobCard } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { canEdit } from "../config/permissions";
import { JOB_STATUS_FLOW } from "../config/jobCardWorkflow";
import { DailyJobIntake } from "../components/DailyJobIntake";
import { DailyFlowStep } from "../components/DailyFlowStep";
import { BeforeAfterPhotos, ProgressPhotos } from "../components/DailyJobPhotos";
import { DailyPayment } from "../components/DailyPayment";
import { DailyJobInventory } from "../components/DailyJobInventory";
import { InvoiceDocument, PrintInvoiceButton } from "../components/InvoiceDocument";

/**
 * Daily Jobs — the whole walk-in routine on one page, top to bottom:
 *   1. Register customer & vehicle   2. Assign technicians
 *   3. Vehicle inspection            4. Packages / services
 *   5. Create job card
 *   6. Do the work — move the current job Start → QC → Ready, and send
 *      progress photos to the customer
 *   7. Inventory used — recorded by hand, each item taken out of stock
 *   8. Before & after photos on WhatsApp
 *   9. Invoice                      10. Payment (cash / QR / bank transfer)
 * The "current job" (kept in ?job= so a refresh doesn't lose it) is the one
 * steps 1–5 just created, or one picked from "Continue a job" (today's
 * jobs) at the top.
 */
export function DailyJobsPage() {
  const { user } = useAuth();
  const canAct = !!user && canEdit(user.role, "jobBoard");
  const canBill = !!user && canEdit(user.role, "invoicesPayments");

  const [params, setParams] = useSearchParams();
  const activeJobId = params.get("job");
  const [activeJob, setActiveJob] = useState<JobCard | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [todaysJobs, setTodaysJobs] = useState<JobCard[]>([]);
  const [advancing, setAdvancing] = useState(false);
  const [completing, setCompleting] = useState(false);

  const topRef = useRef<HTMLElement>(null);
  const boardRef = useRef<HTMLElement>(null);
  const invoiceRef = useRef<HTMLElement>(null);
  const photosRef = useRef<HTMLElement>(null);
  const inventoryRef = useRef<HTMLElement>(null);
  const paymentRef = useRef<HTMLElement>(null);

  const setActiveJobId = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params);
      if (id) next.set("job", id);
      else next.delete("job");
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const refreshActive = useCallback(async () => {
    if (!activeJobId) {
      setActiveJob(null);
      setInvoice(null);
      return;
    }
    try {
      const jc = await jobCardsApi.getJobCard(activeJobId);
      setActiveJob(jc);
      setInvoice(jc.invoice ? await billingApi.getInvoice(jc.invoice.id) : null);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [activeJobId]);

  useEffect(() => {
    refreshActive();
  }, [refreshActive]);

  // Today's walk-in jobs, for the "Continue a job" picker.
  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    jobCardsApi
      .listJobCards(undefined, true, { from, to })
      .then((cards) => setTodaysJobs(cards.sort((a, b) => b.booking.scheduledAt.localeCompare(a.booking.scheduledAt))))
      .catch(() => {});
  }, [boardKey]);

  async function advance() {
    if (!activeJob || !nextStatus) return;
    if (nextStatus === "IN_PROGRESS" && activeJob.technicians.length === 0) {
      setError("No technician is assigned to this job — assign one on the full job card first.");
      return;
    }
    setAdvancing(true);
    setError(null);
    try {
      await bookingsApi.updateBookingStatus(activeJob.bookingId, nextStatus);
      await refreshActive();
      setBoardKey((k) => k + 1);
      // Work finished — carry on to the inventory check (step 7) and after photos (step 8).
      if (nextStatus === "READY") {
        setNotice(`Work finished on ${activeJob.booking.vehicle?.plateNumber} — check the inventory used in step 7, then add the after photos in step 8.`);
        scrollTo(inventoryRef);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setAdvancing(false);
    }
  }

  // The "Job completed" hand-over below step 10: only offered once the
  // invoice is fully paid (the
  // backend refuses it before that for walk-ins).
  async function completeJob() {
    if (!activeJob) return;
    setCompleting(true);
    setError(null);
    try {
      await bookingsApi.updateBookingStatus(activeJob.bookingId, "COMPLETED");
      setNotice(`${activeJob.booking.vehicle?.plateNumber} completed — vehicle handed over to ${activeJob.booking.customer?.name}.`);
      await refreshActive();
      setBoardKey((k) => k + 1);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setCompleting(false);
    }
  }

  function scrollTo(ref: RefObject<HTMLElement | null>) {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function nextCustomer() {
    setNotice(null);
    setError(null);
    setActiveJobId(null);
    scrollTo(topRef);
  }

  async function createInvoiceNow() {
    if (!activeJob) return;
    setCreatingInvoice(true);
    setError(null);
    try {
      await billingApi.createInvoice(activeJob.id);
      await refreshActive();
      setBoardKey((k) => k + 1);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setCreatingInvoice(false);
    }
  }

  const status = activeJob?.status;
  const statusLabel = JOB_STATUS_FLOW.find((s) => s.status === status)?.label ?? status;
  const nextLabel = JOB_STATUS_FLOW.find((s) => s.status === status)?.nextLabel;
  const nextStatus = JOB_STATUS_FLOW.find((s) => s.status === status)?.next;
  const workDone = status === "READY" || status === "COMPLETED";
  // Step 6 only tracks the work itself (Waiting → In Progress → Quality
  // Check). Ready/Completed aren't shown there: "Work finished" moves the
  // job to Ready, and "Job completed" after payment (below step 10) closes it.
  const workStages = JOB_STATUS_FLOW.filter((s) => s.status !== "READY" && s.status !== "COMPLETED");
  const statusIndex = workDone ? workStages.length : workStages.findIndex((s) => s.status === status);
  const workLabel = workDone ? "Work finished" : statusLabel;
  const hasBefore = !!activeJob?.photos.some((p) => p.type === "BEFORE");
  const hasAfter = !!activeJob?.photos.some((p) => p.type === "AFTER");
  const isPaid = invoice?.status === "PAID";
  const isCompleted = status === "COMPLETED";
  const usageCount = activeJob?.inventoryUsages?.length ?? 0;

  return (
    <div>
      <div className="no-print mb-6">
        <h1 className="text-2xl font-semibold text-white">Daily Jobs</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Follow the 10 steps from top to bottom for each walk-in customer.
        </p>
        {todaysJobs.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="continue-job" className="text-neutral-400">
              Continue a job from today:
            </label>
            <select
              id="continue-job"
              value={activeJobId ?? ""}
              onChange={(e) => {
                setNotice(null);
                setError(null);
                setActiveJobId(e.target.value || null);
              }}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm"
            >
              <option value="">— New customer —</option>
              {todaysJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.booking.vehicle?.plateNumber} · {j.booking.customer?.name} ·{" "}
                  {j.invoice?.status === "PAID"
                    ? "Paid"
                    : JOB_STATUS_FLOW.find((s) => s.status === j.status)?.label ?? j.status}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {notice && <div className="no-print mb-4 rounded-md bg-green-950 px-3 py-2 text-sm text-green-300">{notice}</div>}
      {error && <div className="no-print mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-500">{error}</div>}

      {/* Steps 1–5 */}
      <DailyJobIntake
        ref={topRef}
        activeJob={activeJob}
        canAct={canAct}
        onCreated={(jc, warning) => {
          setError(warning ?? null);
          setNotice(`Job card created for ${jc.booking.vehicle?.plateNumber} — now do the work in step 6.`);
          setActiveJobId(jc.id);
          setBoardKey((k) => k + 1);
          scrollTo(boardRef);
        }}
        onNextCustomer={nextCustomer}
      />

      {/* Step 6 */}
      <DailyFlowStep
        ref={boardRef}
        n={6}
        title="Do the work & send progress photos"
        state={!activeJob ? "locked" : workDone ? "done" : "active"}
        summary={
          !activeJob ? (
            "Create a job above, or pick one from “Continue a job” at the top."
          ) : (
            <>
              <span className="font-semibold text-white">{activeJob.booking.vehicle?.plateNumber}</span> is{" "}
              <span className="font-semibold text-red-400">{workLabel}</span>
              {activeJob.technicians.length > 0 && <> · {activeJob.technicians.map((t) => t.user.name).join(", ")}</>}
            </>
          )
        }
      >
        {activeJob && (
          <>
            <ol className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              {workStages.map((s, idx) => (
                <li key={s.status} className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 font-medium ${
                      idx < statusIndex
                        ? "bg-red-600 text-white"
                        : idx === statusIndex
                          ? "bg-white text-black"
                          : "bg-neutral-800 text-neutral-500"
                    }`}
                  >
                    {idx < statusIndex ? "✓ " : ""}
                    {s.label}
                  </span>
                  {idx < workStages.length - 1 && <span className="text-neutral-600">→</span>}
                </li>
              ))}
            </ol>
            {canAct && nextStatus && !workDone && (
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={advance}
                  disabled={advancing}
                  className="rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {advancing ? "Updating..." : nextStatus === "READY" ? "Work finished →" : `${nextLabel} →`}
                </button>
                <span className="text-xs text-neutral-500">The customer gets a WhatsApp update at each stage.</span>
              </div>
            )}
            {workDone && (
              <p className="mb-4 text-sm text-neutral-300">
                ✓ Work finished — check the inventory used in step 7, then the after photos in step 8.
              </p>
            )}
            <ProgressPhotos jobCard={activeJob} canAct={canAct} onChanged={refreshActive} />
          </>
        )}
      </DailyFlowStep>

      {/* Step 7 */}
      <DailyFlowStep
        ref={inventoryRef}
        n={7}
        title="Inventory used"
        state={!activeJob ? "locked" : workDone && usageCount > 0 ? "done" : "active"}
        summary={
          !activeJob
            ? "Create a job above, or pick one from “Continue a job” at the top."
            : usageCount > 0
              ? `${usageCount} item${usageCount === 1 ? "" : "s"} recorded and taken out of stock.`
              : "Add each material used on this job by hand — it's taken out of stock on the Inventory page as you add it."
        }
      >
        {activeJob && <DailyJobInventory jobCard={activeJob} canAct={canAct} onChanged={refreshActive} />}
      </DailyFlowStep>

      {/* Step 8 */}
      <DailyFlowStep
        ref={photosRef}
        n={8}
        title="Before & after photos (WhatsApp)"
        state={!activeJob ? "locked" : hasBefore && hasAfter ? "done" : "active"}
        summary={
          !activeJob
            ? "Create a job above, or pick one from “Continue a job” at the top."
            : "Add before photos when the car arrives and after photos when it's finished, then send them to the customer."
        }
      >
        {activeJob && <BeforeAfterPhotos jobCard={activeJob} canAct={canAct} onChanged={refreshActive} />}
      </DailyFlowStep>

      {/* Step 9 */}
      <DailyFlowStep
        ref={invoiceRef}
        n={9}
        title="Invoice"
        state={!activeJob ? "locked" : invoice ? "done" : "active"}
        summary={
          !activeJob
            ? "Create a job above, or pick one from “Continue a job” at the top."
            : !invoice
              ? "The invoice is created automatically when the job is sent to Quality Check."
              : `Invoice INV-${String(invoice.invoiceNumber).padStart(6, "0")} — total Rs. ${invoice.total}`
        }
        action={invoice && <PrintInvoiceButton />}
      >
        {activeJob && !invoice && canBill && (
          <button onClick={createInvoiceNow} disabled={creatingInvoice} className={secondaryBtn}>
            {creatingInvoice ? "Creating..." : "Create invoice now"}
          </button>
        )}
      </DailyFlowStep>
      {invoice && (
        <div className="mb-6 ml-[52px]">
          <InvoiceDocument invoice={invoice} />
        </div>
      )}

      {/* Step 10 */}
      <DailyFlowStep
        ref={paymentRef}
        n={10}
        title="Payment — cash, QR or bank transfer"
        state={!invoice ? "locked" : isPaid ? "done" : "active"}
        last
        summary={
          !invoice
            ? "Available once the job has an invoice."
            : isPaid
              ? "✓ Paid in full."
              : "Take the payment by cash, QR or bank transfer."
        }
      >
        {invoice && !isPaid && (
          <DailyPayment
            invoice={invoice}
            canBill={canBill}
            onPaid={async (msg) => {
              setNotice(msg);
              await refreshActive();
              setBoardKey((k) => k + 1);
            }}
          />
        )}
      </DailyFlowStep>

      {/* Final: Job completed — after payment */}
      {activeJob && (
        <div
          className={`no-print mt-6 ml-[52px] flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${
            isCompleted ? "border-green-800 bg-green-950/30" : isPaid ? "border-green-700 bg-neutral-900" : "border-neutral-800 bg-neutral-900/60"
          }`}
        >
          <div className="text-sm">
            {isCompleted ? (
              <span className="font-semibold text-green-400">
                ✓ Job completed — {activeJob.booking.vehicle?.plateNumber} handed over to {activeJob.booking.customer?.name}.
              </span>
            ) : !isPaid ? (
              <span className="text-neutral-500">The Job completed button unlocks once the customer has paid (step 10).</span>
            ) : !workDone ? (
              <span className="text-yellow-400">Paid — press “Work finished” in step 6 first.</span>
            ) : canBill ? (
              <span className="text-neutral-200">Paid in full. Hand the vehicle over to the customer and press Job completed.</span>
            ) : (
              <span className="text-neutral-500">A receptionist, manager or admin presses Job completed.</span>
            )}
          </div>
          {isCompleted ? (
            canAct && (
              <button
                onClick={nextCustomer}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                + Next customer ↑
              </button>
            )
          ) : (
            <button
              onClick={completeJob}
              disabled={!isPaid || !workDone || !canBill || completing}
              className="rounded-md bg-green-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              {completing ? "Completing..." : "✓ Job completed"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const secondaryBtn =
  "rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50";
