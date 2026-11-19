import { BookingRequestPanel, preferredText } from "../../components/BookingRequestPanel";
import { useEffect, useState, type FormEvent } from "react";
import { formatMoney } from "../../utils/money";
import { Link, useParams } from "react-router-dom";
import * as portalApi from "../../api/portal";
import type { BankAccount, Booking, BookingActivityLogEntry } from "../../api/types";
import { apiErrorMessage, API_URL } from "../../api/client";
import { StatusStepper } from "../../components/StatusStepper";
import { StatusBadge } from "../../components/StatusBadge";
import { ActivityTimeline } from "../../components/ActivityTimeline";
import { DamageInspectionDiagram } from "../../components/DamageInspectionDiagram";
import { InvoiceDocument, PrintInvoiceButton } from "../../components/InvoiceDocument";
import { Modal } from "../../components/Modal";
import { useCustomerAuth } from "../../hooks/useCustomerAuth";
import { DEFAULT_SITE_CONTENT } from "../../config/siteContentDefaults";
import { SlotPicker } from "../../components/SlotPicker";
import type { ScheduleSettings } from "../../api/types";

export function PortalBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { refreshLoyalty } = useCustomerAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [activityLog, setActivityLog] = useState<BookingActivityLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [decidingMarkingId, setDecidingMarkingId] = useState<string | null>(null);
  const [showCancelBlocked, setShowCancelBlocked] = useState(false);
  const [rules, setRules] = useState<ScheduleSettings | null>(null);
  const [moving, setMoving] = useState(false);
  const [newTime, setNewTime] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [savingMove, setSavingMove] = useState(false);

  useEffect(() => {
    portalApi.getScheduleRules().then(setRules).catch(() => {});
  }, []);

  async function load() {
    if (!id) return;
    setError(null);
    try {
      const [b, log] = await Promise.all([portalApi.getMyBooking(id), portalApi.getMyBookingActivityLog(id)]);
      setBooking(b);
      setActivityLog(log);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAcknowledge(inspectionId: string) {
    setError(null);
    try {
      await portalApi.acknowledgeInspection(inspectionId);
      setNotice("Inspection acknowledged");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  // The customer's own yes/no on a specific priced repair — approved
  // items get added to the eventual invoice, declined ones don't. Locks
  // the moment they decide (see decideDamageMarking's doc comment).
  async function handleDecideMarking(markingId: string, approved: boolean) {
    setError(null);
    setDecidingMarkingId(markingId);
    try {
      await portalApi.decideDamageMarking(markingId, approved);
      setNotice(approved ? "Repair approved — it'll be added to your invoice" : "Repair declined");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setDecidingMarkingId(null);
    }
  }

  async function handlePaymentSubmitted() {
    setNotice("Payment submitted — awaiting staff verification");
    load();
    if (booking?.customerId) {
      portalApi.getMyLoyalty(booking.customerId).then((l) => refreshLoyalty(l.loyaltyPoints)).catch(() => {});
    }
  }

  // Customers may change or cancel online until the change window before
  // the booking (Hours & rules); after that they're asked to call.
  const changeHours = rules?.customerChangeHours ?? 12;
  const canChangeOnline =
    !!booking &&
    !booking.isWalkIn &&
    (booking.status === "PENDING" || booking.status === "CONFIRMED") &&
    new Date(booking.scheduledAt).getTime() - Date.now() >= changeHours * 3600000;

  async function handleMove() {
    if (!id || !newTime) return;
    setSavingMove(true);
    setMoveError(null);
    try {
      await portalApi.rescheduleMyBooking(id, newTime);
      setMoving(false);
      setNewTime("");
      setNotice(
        `Booking moved to ${new Date(newTime).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`
      );
      load();
    } catch (err) {
      setMoveError(apiErrorMessage(err));
    } finally {
      setSavingMove(false);
    }
  }

  async function handleCancel() {
    if (!id) return;
    const isOpenRequest = booking?.requestStage === "REQUESTED" || booking?.requestStage === "TIME_PROPOSED";
    if (!canChangeOnline && !isOpenRequest) {
      setShowCancelBlocked(true);
      return;
    }
    if (!confirm(isOpenRequest ? "Cancel this booking request?" : "Cancel this booking?")) return;
    setError(null);
    try {
      await portalApi.cancelMyBooking(id);
      setNotice("Booking cancelled");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  if (error) return <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>;
  if (!booking) return <div className="text-neutral-500">Loading...</div>;

  const jobCard = booking.jobCard;
  // A job card has one damage inspection now.
  const preInspection = jobCard?.damageInspections[0];
  const before = jobCard?.photos.filter((p) => p.type === "BEFORE") ?? [];
  const after = jobCard?.photos.filter((p) => p.type === "AFTER") ?? [];

  return (
    <div>
      <Link to="/portal/bookings" className="mb-4 inline-block text-sm text-neutral-400 hover:underline">
        ← Back to My Bookings
      </Link>

      <BookingRequestPanel
        booking={booking}
        minutes={booking.estimatedMinutes}
        onChanged={(m) => {
          setNotice(m);
          load();
        }}
      />

      <div className="animate-pop-in mb-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">
              {booking.vehicle?.plateNumber} — {booking.vehicle?.make} {booking.vehicle?.model}
            </h1>
            <div className="text-sm text-neutral-400">
              {booking.requestStage === "REQUESTED" ? `Preferred: ${preferredText(booking)}` : new Date(booking.scheduledAt).toLocaleString()}
              {booking.requestStage === "TIME_PROPOSED" && " (waiting for your confirmation)"}
            </div>
          </div>
          <StatusBadge status={booking.status} />
        </div>
        <StatusStepper status={booking.status} />
        {(booking.status === "PENDING" || booking.status === "CONFIRMED") && !booking.isWalkIn && (booking.requestStage === "REQUESTED" || booking.requestStage === "TIME_PROPOSED") && (
          <div className="mt-4 flex justify-end border-t border-neutral-800 pt-4">
            <button onClick={handleCancel} className="text-sm font-medium text-red-500 hover:underline">
              Cancel request
            </button>
          </div>
        )}
        {(booking.status === "PENDING" || booking.status === "CONFIRMED") && !booking.isWalkIn && booking.requestStage !== "REQUESTED" && booking.requestStage !== "TIME_PROPOSED" && (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-neutral-800 pt-4">
            {!canChangeOnline && (
              <span className="mr-auto text-xs text-neutral-500">
                Changes within {changeHours} hours of the booking need a call: {DEFAULT_SITE_CONTENT.contact.phone}
              </span>
            )}
            <button
              onClick={() => (canChangeOnline ? setMoving(true) : setShowCancelBlocked(true))}
              className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black hover:bg-neutral-200"
            >
              Change date / time
            </button>
            <button onClick={handleCancel} className="text-sm font-medium text-red-500 hover:underline">
              Cancel Booking
            </button>
          </div>
        )}
      </div>

      {moving && (
        <Modal title="Change date / time" onClose={() => setMoving(false)} wide accent>
          <p className="mb-3 text-sm text-neutral-400">
            Now booked for{" "}
            <span className="text-white">
              {new Date(booking.scheduledAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
            . Pick a new time:
          </p>
          <SlotPicker load={(d) => portalApi.getAvailabilityFor(d, undefined, booking.id)} durationMinutes={60} value={newTime} onChange={setNewTime} />
          {moveError && <div className="mt-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{moveError}</div>}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleMove}
              disabled={!newTime || savingMove}
              className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {savingMove ? "Moving…" : "Confirm new time"}
            </button>
          </div>
        </Modal>
      )}

      {showCancelBlocked && (
        <Modal title="Please call us" onClose={() => setShowCancelBlocked(false)}>
          <p className="text-sm text-neutral-300">
            Bookings can be changed or cancelled online up to {changeHours} hours before the booking time.
          </p>
          <p className="mt-3 text-sm text-neutral-300">Please contact us directly to change or cancel it now.</p>
          <p className="mt-3 text-sm text-neutral-400">
            {DEFAULT_SITE_CONTENT.contact.phone} · {DEFAULT_SITE_CONTENT.contact.hours}
          </p>
          <div className="mt-5 text-right">
            <button
              onClick={() => setShowCancelBlocked(false)}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Got it
            </button>
          </div>
        </Modal>
      )}

      {notice && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{notice}</div>}

      <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">Services</h2>
        <ul className="space-y-1 text-sm">
          {booking.services?.map((s) => (
            <li key={s.id} className="flex justify-between text-neutral-300">
              <span>{s.service?.name ?? s.package?.name}</span>
              <span>{formatMoney(s.price)}</span>
            </li>
          ))}
        </ul>
      </div>

      {jobCard?.technicians && jobCard.technicians.length > 0 && (
        <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">Working On Your Vehicle</h2>
          <ul className="space-y-1 text-sm text-neutral-300">
            {jobCard.technicians.map((t) => (
              <li key={t.userId}>{t.user.name}</li>
            ))}
          </ul>
        </div>
      )}

      {(jobCard?.startedAt || jobCard?.completedAt) && (
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {jobCard.startedAt && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="text-xs uppercase text-neutral-500">Work Started</div>
              <div className="text-sm font-medium text-neutral-200">{new Date(jobCard.startedAt).toLocaleString()}</div>
            </div>
          )}
          {jobCard.completedAt && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="text-xs uppercase text-neutral-500">Completed</div>
              <div className="text-sm font-medium text-neutral-200">{new Date(jobCard.completedAt).toLocaleString()}</div>
            </div>
          )}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase text-neutral-400">Timeline</h2>
        <ActivityTimeline entries={activityLog} />
      </div>

      {preInspection && (
        <div id="damage-inspection" className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5 scroll-mt-4">
          <h2 className="mb-4 text-sm font-semibold uppercase text-neutral-400">Damage Inspection</h2>
          <div>
              {preInspection ? (
                <>
                  {preInspection.inspectedByUser && (
                    <p className="mb-2 text-xs text-neutral-500">
                      Inspected by {preInspection.inspectedByUser.name} on {new Date(preInspection.createdAt).toLocaleDateString()}
                    </p>
                  )}
                  {preInspection.markings.length === 0 && (
                    <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-green-950 px-3 py-1 text-xs font-semibold text-green-400">
                      ✓ No damage found
                    </div>
                  )}
                  <DamageInspectionDiagram
                    markings={preInspection.markings}
                    vehicleType={booking.vehicle?.vehicleType ?? "SEDAN"}
                    onDecide={(markingId, approved) => handleDecideMarking(markingId, approved)}
                    decidingId={decidingMarkingId}
                  />
                  <div className="mt-2 text-xs">
                    {preInspection.customerAcknowledged ? (
                      <span className="text-red-400">✓ You acknowledged this inspection</span>
                    ) : (
                      <button
                        onClick={() => handleAcknowledge(preInspection.id)}
                        className="rounded-md bg-red-600 px-2 py-1 text-white hover:bg-red-700"
                      >
                        Confirm this inspection
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-neutral-500">Not recorded yet.</div>
              )}
          </div>
        </div>
      )}

      {(before.length > 0 || after.length > 0) && (
        <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">Photos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="mb-2 text-xs font-medium uppercase text-neutral-500">Before</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                {before.map((p) => (
                  <a key={p.id} href={`${API_URL}${p.url}`} target="_blank" rel="noreferrer">
                    <img src={`${API_URL}${p.url}`} className="h-20 w-full rounded object-cover" alt="Before" />
                  </a>
                ))}
                {before.length === 0 && <div className="text-xs text-neutral-500">None yet</div>}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-medium uppercase text-neutral-500">After</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                {after.map((p) => (
                  <a key={p.id} href={`${API_URL}${p.url}`} target="_blank" rel="noreferrer">
                    <img src={`${API_URL}${p.url}`} className="h-20 w-full rounded object-cover" alt="After" />
                  </a>
                ))}
                {after.length === 0 && <div className="text-xs text-neutral-500">None yet</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {jobCard?.invoice && (
        <InvoiceSection invoiceId={jobCard.invoice.id} onPaymentSubmitted={handlePaymentSubmitted} />
      )}

      {booking.status === "COMPLETED" && jobCard && (
        <ReviewSection jobCardId={jobCard.id} existingReview={jobCard.review ?? null} />
      )}
    </div>
  );
}

function InvoiceSection({ invoiceId, onPaymentSubmitted }: { invoiceId: string; onPaymentSubmitted: () => void }) {
  const [invoice, setInvoice] = useState<Awaited<ReturnType<typeof portalApi.getMyInvoice>> | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [payMethod, setPayMethod] = useState<"SERVICE_CENTER" | "BANK_TRANSFER" | null>(null);
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setError(null);
    try {
      const inv = await portalApi.getMyInvoice(invoiceId);
      setInvoice(inv);
      if (!amount) setAmount(inv.total);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    portalApi.listActiveBankAccounts().then(setBankAccounts).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!slip) {
      setError("Upload your bank transfer slip");
      return;
    }
    setSubmitting(true);
    try {
      await portalApi.submitMyPayment(invoiceId, "BANK_TRANSFER", Number(amount), slip);
      setSlip(null);
      onPaymentSubmitted();
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!invoice) return null;

  const pendingPayment = invoice.payments?.find((p) => p.status === "PENDING_VERIFICATION");
  const verifiedPayment = invoice.payments?.find((p) => p.status === "VERIFIED");

  return (
    <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase text-neutral-400">Invoice</h2>
        <StatusBadge status={invoice.status} />
      </div>
      <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs uppercase text-neutral-500">Subtotal</div>{formatMoney(invoice.subtotal)}
        </div>
        <div>
          <div className="text-xs uppercase text-neutral-500">Tax</div>{formatMoney(invoice.tax)}
        </div>
        <div>
          <div className="text-xs uppercase text-neutral-500">Discount</div>{formatMoney(invoice.discount)}
        </div>
        <div>
          <div className="text-xs uppercase text-neutral-500">Total</div>
          <span className="font-semibold">{formatMoney(invoice.total)}</span>
        </div>
      </div>

      {invoice.status === "PAID" ? (
        <div>
          <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">
            Payment verified — your invoice is fully paid. Thank you!
          </div>
          <div className="no-print mb-2 flex justify-end">
            <PrintInvoiceButton />
          </div>
          <InvoiceDocument invoice={invoice} />
        </div>
      ) : pendingPayment ? (
        <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
          Your payment is pending verification. We'll update this once staff confirms your bank transfer.
        </div>
      ) : verifiedPayment ? (
        <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">
          A payment has been verified. Remaining balance still due, if any.
        </div>
      ) : payMethod === null ? (
        <div className="border-t border-neutral-800 pt-4">
          <div className="mb-3 text-sm font-medium text-neutral-300">How would you like to pay?</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setPayMethod("SERVICE_CENTER")}
              className="rounded-md border border-neutral-700 px-4 py-3 text-left text-sm hover:bg-black"
            >
              <div className="font-medium text-white">Visit Service Center</div>
              <div className="mt-0.5 text-xs text-neutral-400">Pay in person by cash or card when you arrive.</div>
            </button>
            <button
              onClick={() => setPayMethod("BANK_TRANSFER")}
              className="rounded-md border border-neutral-700 px-4 py-3 text-left text-sm hover:bg-black"
            >
              <div className="font-medium text-white">Bank Transfer</div>
              <div className="mt-0.5 text-xs text-neutral-400">Transfer to our account and upload the slip.</div>
            </button>
          </div>
        </div>
      ) : payMethod === "SERVICE_CENTER" ? (
        <div className="border-t border-neutral-800 pt-4">
          <div className="rounded-md bg-black px-3 py-2 text-sm text-neutral-300">
            No action needed online — please pay by cash or card at the service center when you visit. Our team will
            record the payment for you.
          </div>
          <button
            onClick={() => setPayMethod(null)}
            className="mt-2 text-xs text-neutral-400 hover:underline"
          >
            ← Choose a different payment method
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-neutral-800 pt-4">
          {bankAccounts.length === 0 ? (
            <div className="rounded-md bg-red-950 px-3 py-2 text-xs text-red-300">
              No bank account is on file yet — please contact us or choose "Visit Service Center" instead.
            </div>
          ) : (
            <div className="space-y-2 rounded-md bg-black px-3 py-2 text-xs text-neutral-300">
              <strong>Bank transfer instructions:</strong>
              {bankAccounts.map((a) => (
                <div key={a.id} className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5">
                  <div className="font-medium text-white">{a.bankName}</div>
                  <div>
                    {a.accountName} — Account #{a.accountNumber}
                    {a.branch && ` — ${a.branch}`}
                  </div>
                </div>
              ))}
              <div>Upload your payment slip below and our team will verify it.</div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-300">Amount</label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-300">Payment Slip</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                required
                onChange={(e) => setSlip(e.target.files?.[0] ?? null)}
                className="w-full text-sm"
              />
            </div>
          </div>
          {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Bank Transfer Payment"}
            </button>
            <button
              type="button"
              onClick={() => setPayMethod(null)}
              className="text-xs text-neutral-400 hover:underline"
            >
              ← Choose a different payment method
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ReviewSection({
  jobCardId,
  existingReview,
}: {
  jobCardId: string;
  existingReview: { rating: number; comment?: string | null } | null;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(!!existingReview);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await portalApi.submitMyReview(jobCardId, rating, comment || undefined);
      setSubmitted(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase text-neutral-400">Review</h2>
      {submitted ? (
        <div className="text-sm text-neutral-300">
          {existingReview ? (
            <>
              <div className="mb-1">You rated this service {existingReview.rating} / 5.</div>
              {existingReview.comment && <div className="text-neutral-400">"{existingReview.comment}"</div>}
            </>
          ) : (
            "Thanks for your review!"
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`text-2xl ${n <= rating ? "text-red-300" : "text-neutral-300"}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Comment (optional)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            />
          </div>
          {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Submitting..." : "Submit Review"}
          </button>
        </form>
      )}
    </div>
  );
}
