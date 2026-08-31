import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import * as portalApi from "../../api/portal";
import type { Booking } from "../../api/types";
import { apiErrorMessage, API_URL } from "../../api/client";
import { StatusStepper } from "../../components/StatusStepper";
import { StatusBadge } from "../../components/StatusBadge";
import { CarDiagram } from "../../components/CarDiagram";
import { useCustomerAuth } from "../../hooks/useCustomerAuth";

export function PortalBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { refreshLoyalty } = useCustomerAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setError(null);
    try {
      setBooking(await portalApi.getMyBooking(id));
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

  async function handlePaymentSubmitted() {
    setNotice("Payment submitted — awaiting staff verification");
    load();
    if (booking?.customerId) {
      portalApi.getMyLoyalty(booking.customerId).then((l) => refreshLoyalty(l.loyaltyPoints)).catch(() => {});
    }
  }

  if (error) return <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>;
  if (!booking) return <div className="text-slate-400">Loading...</div>;

  const jobCard = booking.jobCard;
  const preInspection = jobCard?.damageInspections.find((d) => d.stage === "PRE_SERVICE");
  const postInspection = jobCard?.damageInspections.find((d) => d.stage === "POST_SERVICE");
  const before = jobCard?.photos.filter((p) => p.type === "BEFORE") ?? [];
  const after = jobCard?.photos.filter((p) => p.type === "AFTER") ?? [];

  return (
    <div>
      <Link to="/portal/bookings" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Back to My Bookings
      </Link>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">
              {booking.vehicle?.plateNumber} — {booking.vehicle?.make} {booking.vehicle?.model}
            </h1>
            <div className="text-sm text-slate-500">{new Date(booking.scheduledAt).toLocaleString()}</div>
          </div>
          <StatusBadge status={booking.status} />
        </div>
        <StatusStepper status={booking.status} />
      </div>

      {notice && <div className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Services</h2>
        <ul className="space-y-1 text-sm">
          {booking.services?.map((s) => (
            <li key={s.id} className="flex justify-between text-slate-600">
              <span>{s.service?.name ?? s.package?.name}</span>
              <span>${s.price}</span>
            </li>
          ))}
        </ul>
      </div>

      {(preInspection || postInspection) && (
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
                      <span className="text-green-600">✓ You acknowledged this inspection</span>
                    ) : (
                      <button
                        onClick={() => handleAcknowledge(preInspection.id)}
                        className="rounded-md bg-slate-800 px-2 py-1 text-white hover:bg-slate-700"
                      >
                        Acknowledge pre-service condition
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-400">Not recorded yet.</div>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-700">Post-Service</h3>
              {postInspection ? (
                <>
                  <CarDiagram markings={postInspection.diagramMarkings} />
                  <div className="mt-2 text-xs">
                    {postInspection.customerAcknowledged ? (
                      <span className="text-green-600">✓ You acknowledged this inspection</span>
                    ) : (
                      <button
                        onClick={() => handleAcknowledge(postInspection.id)}
                        className="rounded-md bg-slate-800 px-2 py-1 text-white hover:bg-slate-700"
                      >
                        Acknowledge post-service condition
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-400">Not recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {(before.length > 0 || after.length > 0) && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Photos</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-2 text-xs font-medium uppercase text-slate-400">Before</div>
              <div className="grid grid-cols-3 gap-1">
                {before.map((p) => (
                  <a key={p.id} href={`${API_URL}${p.url}`} target="_blank" rel="noreferrer">
                    <img src={`${API_URL}${p.url}`} className="h-20 w-full rounded object-cover" alt="Before" />
                  </a>
                ))}
                {before.length === 0 && <div className="text-xs text-slate-400">None yet</div>}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-medium uppercase text-slate-400">After</div>
              <div className="grid grid-cols-3 gap-1">
                {after.map((p) => (
                  <a key={p.id} href={`${API_URL}${p.url}`} target="_blank" rel="noreferrer">
                    <img src={`${API_URL}${p.url}`} className="h-20 w-full rounded object-cover" alt="After" />
                  </a>
                ))}
                {after.length === 0 && <div className="text-xs text-slate-400">None yet</div>}
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
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase text-slate-500">Invoice</h2>
        <StatusBadge status={invoice.status} />
      </div>
      <div className="mb-4 grid grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs uppercase text-slate-400">Subtotal</div>${invoice.subtotal}
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Tax</div>${invoice.tax}
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Discount</div>${invoice.discount}
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Total</div>
          <span className="font-semibold">${invoice.total}</span>
        </div>
      </div>

      {invoice.status === "PAID" ? (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Payment verified — your invoice is fully paid. Thank you!
        </div>
      ) : pendingPayment ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Your payment is pending verification. We'll update this once staff confirms your bank transfer.
        </div>
      ) : verifiedPayment ? (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          A payment has been verified. Remaining balance still due, if any.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-slate-100 pt-4">
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <strong>Bank transfer instructions:</strong> Transfer to Autobody Service Station, Account
            #1234567890, Example Bank. Upload your payment slip below and our team will verify it.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Amount</label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Payment Slip</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                required
                onChange={(e) => setSlip(e.target.files?.[0] ?? null)}
                className="w-full text-sm"
              />
            </div>
          </div>
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Bank Transfer Payment"}
          </button>
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
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Review</h2>
      {submitted ? (
        <div className="text-sm text-slate-600">
          {existingReview ? (
            <>
              <div className="mb-1">You rated this service {existingReview.rating} / 5.</div>
              {existingReview.comment && <div className="text-slate-500">"{existingReview.comment}"</div>}
            </>
          ) : (
            "Thanks for your review!"
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`text-2xl ${n <= rating ? "text-amber-400" : "text-slate-200"}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Comment (optional)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "Submitting..." : "Submit Review"}
          </button>
        </form>
      )}
    </div>
  );
}
