import { useEffect, useState } from "react";
import { formatMoney } from "../utils/money";
import * as billingApi from "../api/billing";
import * as bankAccountsApi from "../api/bankAccounts";
import * as siteContentApi from "../api/siteContent";
import type { BankAccount, Invoice, PaymentMethod } from "../api/types";
import { API_URL, apiErrorMessage } from "../api/client";
import { useAuth } from "../hooks/useAuth";

type Tab = "CASH" | "QR" | "BANK_TRANSFER";

const TABS: { key: Tab; label: string }[] = [
  { key: "CASH", label: "💵 Cash" },
  { key: "QR", label: "📱 QR" },
  { key: "BANK_TRANSFER", label: "🏦 Bank transfer" },
];

/**
 * Step 10 — take payment for the current job's invoice, three ways:
 *  - Cash: amount + cash given → change; recorded as verified.
 *  - QR: show the shop's scan-to-pay QR; staff record it once they see the
 *    payment confirmation on the customer's phone (verified immediately).
 *  - Bank transfer: shows the shop's bank account(s); needs the slip and
 *    stays "pending" until a manager/admin verifies it (they can do that
 *    right here).
 */
export function DailyPayment({ invoice, canBill, onPaid }: { invoice: Invoice; canBill: boolean; onPaid: (msg: string) => void }) {
  const { user } = useAuth();
  const canVerify = !!user && ["ADMIN", "MANAGER"].includes(user.role);
  const isAdmin = user?.role === "ADMIN";

  const verifiedPaid = (invoice.payments ?? [])
    .filter((p) => p.status === "VERIFIED")
    .reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.max(0, Math.round((Number(invoice.total) - verifiedPaid) * 100) / 100);
  const pending = (invoice.payments ?? []).filter((p) => p.status === "PENDING_VERIFICATION");

  const [tab, setTab] = useState<Tab>("CASH");
  const [amount, setAmount] = useState(String(balance));
  const [cashGiven, setCashGiven] = useState("");
  const [slip, setSlip] = useState<File | null>(null);
  const [qr, setQr] = useState<siteContentApi.PaymentQr | null>(null);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setAmount(String(balance)), [balance]);
  useEffect(() => {
    siteContentApi.getPaymentQr().then(setQr).catch(() => {});
    bankAccountsApi
      .listBankAccounts()
      .then((bs) => setBanks(bs.filter((b) => b.active)))
      .catch(() => {});
  }, []);

  async function pay(method: PaymentMethod) {
    setError(null);
    const amt = Number(amount);
    if (!(amt > 0)) {
      setError("Enter the amount paid");
      return;
    }
    if (method === "BANK_TRANSFER" && !slip) {
      setError("Attach the bank transfer slip (photo or PDF)");
      return;
    }
    setSaving(true);
    try {
      await billingApi.submitPayment(invoice.id, method, amt, method === "BANK_TRANSFER" ? slip : null);
      setSlip(null);
      setCashGiven("");
      onPaid(
        method === "BANK_TRANSFER"
          ? `Bank transfer of Rs. ${amt} recorded — waiting for manager verification`
          : `${method === "QR" ? "QR" : "Cash"} payment of Rs. ${amt} recorded`
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function verify(paymentId: string, status: "VERIFIED" | "REJECTED") {
    setError(null);
    try {
      await billingApi.verifyPayment(paymentId, status);
      onPaid(`Bank transfer ${status === "VERIFIED" ? "verified" : "rejected"}`);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function uploadQr(file: File) {
    setError(null);
    try {
      const url = await siteContentApi.uploadContentImage(file);
      setQr(await siteContentApi.setPaymentQr({ imageUrl: url, note: qr?.note }));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  const change = cashGiven ? Number(cashGiven) - Number(amount) : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <span className="text-neutral-400">
          Total <span className="font-semibold text-white">{formatMoney(invoice.total)}</span>
        </span>
        <span className="text-neutral-400">
          Paid <span className="font-semibold text-white">{formatMoney(verifiedPaid)}</span>
        </span>
        <span className="text-neutral-400">
          Balance due <span className="font-semibold text-red-400">{formatMoney(balance)}</span>
        </span>
      </div>

      {pending.length > 0 && (
        <div className="mb-3 space-y-2 rounded-md border border-yellow-800 bg-yellow-950/30 p-3">
          <div className="text-xs font-semibold uppercase text-yellow-400">Waiting for verification</div>
          {pending.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-200">
              <span>
                {p.method.replace("_", " ")} — {formatMoney(p.amount)}
                {p.slipUrl && (
                  <a href={`${API_URL}${p.slipUrl}`} target="_blank" rel="noreferrer" className="ml-2 text-xs text-red-400 hover:underline">
                    view slip
                  </a>
                )}
              </span>
              {canVerify ? (
                <span className="flex gap-2">
                  <button onClick={() => verify(p.id, "VERIFIED")} className="rounded-md bg-green-700 px-2 py-1 text-xs font-medium text-white hover:bg-green-600">
                    Verify
                  </button>
                  <button onClick={() => verify(p.id, "REJECTED")} className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800">
                    Reject
                  </button>
                </span>
              ) : (
                <span className="text-xs text-neutral-500">a manager must verify</span>
              )}
            </div>
          ))}
        </div>
      )}

      {!canBill ? (
        <div className="text-sm text-neutral-500">You don't have permission to record payments.</div>
      ) : balance <= 0 ? null : (
        <>
          <div className="mb-3 flex gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setError(null);
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  tab === t.key ? "bg-red-600 text-white" : "border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="rounded-md border border-neutral-800 bg-black p-4">
            {tab === "QR" && (
              <div className="mb-4 flex flex-wrap items-start gap-4">
                {qr ? (
                  <img src={`${API_URL}${qr.imageUrl}`} alt="Payment QR code" className="h-48 w-48 rounded-md bg-white object-contain p-2" />
                ) : (
                  <div className="flex h-48 w-48 items-center justify-center rounded-md border border-dashed border-neutral-700 p-3 text-center text-xs text-neutral-500">
                    No shop QR code uploaded yet{isAdmin ? " — upload it on the right" : " — ask an admin to upload it"}.
                  </div>
                )}
                <div className="text-sm text-neutral-300">
                  <p>Ask the customer to scan the QR and pay <span className="font-semibold text-white">{formatMoney(amount)}</span>.</p>
                  <p className="mt-1 text-xs text-neutral-500">Record it only after you see the successful payment on their phone.</p>
                  {isAdmin && (
                    <label className="mt-3 inline-block cursor-pointer rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800">
                      {qr ? "Replace shop QR image" : "Upload shop QR image"}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadQr(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            {tab === "BANK_TRANSFER" && (
              <div className="mb-4">
                {banks.length === 0 ? (
                  <div className="text-xs text-neutral-500">No bank accounts set up — add one under Invoices &amp; Payments.</div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {banks.map((b) => (
                      <div key={b.id} className="rounded-md border border-neutral-800 p-3 text-sm">
                        <div className="font-medium text-white">{b.bankName}</div>
                        <div className="text-neutral-300">{b.accountName}</div>
                        <div className="font-mono text-neutral-200">{b.accountNumber}</div>
                        {b.branch && <div className="text-xs text-neutral-500">{b.branch}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-300">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-32 rounded-md border border-neutral-700 px-3 py-2 text-sm"
                />
              </div>
              {tab === "CASH" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-300">Cash given (optional)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value)}
                    className="w-36 rounded-md border border-neutral-700 px-3 py-2 text-sm"
                  />
                </div>
              )}
              {tab === "BANK_TRANSFER" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-300">Transfer slip</label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setSlip(e.target.files?.[0] ?? null)}
                    className="text-sm text-neutral-300"
                  />
                </div>
              )}
              <button
                onClick={() => pay(tab)}
                disabled={saving}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving
                  ? "Recording..."
                  : tab === "CASH"
                    ? "Record cash payment"
                    : tab === "QR"
                      ? "Customer paid — record QR payment"
                      : "Record bank transfer"}
              </button>
            </div>
            {tab === "CASH" && change !== null && !Number.isNaN(change) && (
              <div className={`mt-2 text-sm ${change < 0 ? "text-red-500" : "text-green-400"}`}>
                {change < 0 ? `Short by Rs. ${(-change).toFixed(2)}` : `Change to give: Rs. ${change.toFixed(2)}`}
              </div>
            )}
          </div>
        </>
      )}
      {error && <div className="mt-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-500">{error}</div>}
    </div>
  );
}
