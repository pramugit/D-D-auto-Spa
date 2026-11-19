import { useEffect, useState, type FormEvent } from "react";
import { formatMoney } from "../utils/money";
import { Link, useParams } from "react-router-dom";
import * as billingApi from "../api/billing";
import * as bankAccountsApi from "../api/bankAccounts";
import type { BankAccount, Invoice } from "../api/types";
import { apiErrorMessage, API_URL } from "../api/client";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { InvoiceDocument, PrintInvoiceButton } from "../components/InvoiceDocument";
import { IncomeDashboard } from "../components/IncomeDashboard";
import { useAuth } from "../hooks/useAuth";
import { canEdit } from "../config/permissions";

export function InvoicesPage() {
  const { id } = useParams<{ id: string }>();
  if (id) return <InvoiceDetail id={id} />;
  return <InvoiceList />;
}

function InvoiceList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await billingApi.listInvoices(filter === "ALL" ? undefined : filter);
      setInvoices(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const pendingCount = invoices.filter((i) =>
    i.payments?.some((p) => p.status === "PENDING_VERIFICATION")
  ).length;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Invoices &amp; Payments</h1>

      <IncomeDashboard />

      <BankAccountsSection />

      {pendingCount > 0 && (
        <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
          {pendingCount} invoice{pendingCount === 1 ? "" : "s"} with a payment awaiting verification.
        </div>
      )}
      <div className="mb-4 flex gap-2">
        {["ALL", "UNPAID", "PARTIALLY_PAID", "PAID"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === s ? "bg-black text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-800"
            }`}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-black text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Vehicle</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Pending Payments</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  No invoices found.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => {
                const pending = inv.payments?.filter((p) => p.status === "PENDING_VERIFICATION").length ?? 0;
                return (
                  <tr key={inv.id} className="border-t border-neutral-800">
                    <td className="px-4 py-2 text-white">{inv.jobCard?.booking.customer?.name}</td>
                    <td className="px-4 py-2 text-neutral-300">{inv.jobCard?.booking.vehicle?.plateNumber}</td>
                    <td className="px-4 py-2 text-neutral-300">{formatMoney(inv.total)}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-2 text-neutral-300">
                      {pending > 0 ? <span className="text-red-300">{pending} pending</span> : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Link to={`/invoices/${inv.id}`} className="text-neutral-200 hover:underline">
                        View
                      </Link>
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

function InvoiceDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Deliberately stricter than invoicesPayments.edit (which includes
  // RECEPTIONIST) — verifying a bank transfer is a fraud-prevention
  // checkpoint, matching PATCH /payments/:id/verify's own explicit rule.
  const canVerify = user && ["ADMIN", "MANAGER"].includes(user.role);
  // Recording a walk-in/in-person cash or card payment (the front-desk
  // counterpart to a customer's own bank-transfer submission) is ordinary
  // Invoices & Payments edit access, same role set as the section itself.
  const canRecordPayment = user && canEdit(user.role, "invoicesPayments");

  async function load() {
    setError(null);
    try {
      const data = await billingApi.getInvoice(id);
      setInvoice(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleVerify(paymentId: string, status: "VERIFIED" | "REJECTED") {
    setError(null);
    try {
      await billingApi.verifyPayment(paymentId, status);
      setNotice(`Payment ${status.toLowerCase()}`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleRecordPayment(method: "CASH" | "CARD", amount: number) {
    setError(null);
    try {
      await billingApi.submitPayment(id, method, amount);
      setNotice(`${method} payment of Rs. ${amount} recorded`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  if (error) return <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>;
  if (!invoice) return <div className="text-neutral-500">Loading...</div>;

  const pendingPayments = invoice.payments?.filter((p) => p.status === "PENDING_VERIFICATION") ?? [];

  return (
    <div>
      <Link to="/invoices" className="no-print mb-4 inline-block text-sm text-neutral-400 hover:underline">
        ← Back to Invoices
      </Link>

      {notice && <div className="no-print mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{notice}</div>}

      <div className="no-print mb-3 flex justify-end">
        <PrintInvoiceButton />
      </div>

      <div className="mb-6">
        <InvoiceDocument invoice={invoice} />
      </div>

      {canVerify && pendingPayments.length > 0 && (
        <div className="no-print mb-6 rounded-lg border border-red-900 bg-red-950 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-red-300">Awaiting Verification</h2>
          <div className="space-y-3">
            {pendingPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-red-900 bg-neutral-900 p-3">
                <div>
                  <div className="text-sm font-medium text-white">
                    {p.method.replace(/_/g, " ")} — {formatMoney(p.amount)}
                  </div>
                  <div className="text-xs text-neutral-500">{new Date(p.createdAt).toLocaleString()}</div>
                  {p.slipUrl && (
                    <a
                      href={`${API_URL}${p.slipUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-neutral-300 hover:underline"
                    >
                      View uploaded slip
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleVerify(p.id, "VERIFIED")}
                    className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                  >
                    Verify
                  </button>
                  <button
                    onClick={() => handleVerify(p.id, "REJECTED")}
                    className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {canRecordPayment && invoice.status !== "PAID" && (
        <div className="no-print rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-1 text-sm font-semibold uppercase text-neutral-400">Record In-Person Payment</h2>
          <p className="mb-2 text-xs text-neutral-500">For a walk-in or a customer paying cash/card at the counter.</p>
          <RecordPaymentForm defaultAmount={invoice.total} onSubmit={handleRecordPayment} />
        </div>
      )}
    </div>
  );
}

// The front-desk counterpart to a customer's own bank-transfer submission —
// a walk-in (Daily Jobs) customer, or a booking customer who chose "Visit
// Service Center", pays in person and staff logs it here. Cash/card payments
// are recorded as already VERIFIED server-side (see invoiceController's
// createPayment), so this immediately reconciles the invoice and — once
// the total is fully covered — auto-completes the booking.
function RecordPaymentForm({
  defaultAmount,
  onSubmit,
}: {
  defaultAmount: string;
  onSubmit: (method: "CASH" | "CARD", amount: number) => Promise<void>;
}) {
  const [method, setMethod] = useState<"CASH" | "CARD">("CASH");
  const [amount, setAmount] = useState(defaultAmount);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(method, Number(amount));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-300">Method</label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as "CASH" | "CARD")}
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm"
        >
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-300">Amount</label>
        <input
          type="number"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-32 rounded-md border border-neutral-700 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {saving ? "Recording..." : "Record Payment"}
      </button>
    </form>
  );
}

// Company bank account(s) shown to customers who choose to pay by bank
// transfer (see the customer portal's PortalBookingDetailPage) — managed
// here instead of being hardcoded in the payment form.
function BankAccountsSection() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  // Deliberately stricter than invoicesPayments.edit (which includes
  // RECEPTIONIST) — managing where customer money gets sent is a
  // fraud-prevention checkpoint, matching the backend's own explicit rule.
  const canManage = user && ["ADMIN", "MANAGER"].includes(user.role);

  async function load() {
    setError(null);
    try {
      setAccounts(await bankAccountsApi.listBankAccounts());
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string) {
    setError(null);
    try {
      await bankAccountsApi.deleteBankAccount(id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase text-neutral-400">Bank Accounts</h2>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
          >
            + New Bank Account
          </button>
        )}
      </div>

      {error && <div className="mb-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}

      {accounts.length === 0 ? (
        <div className="text-sm text-neutral-500">
          No bank accounts on file yet. Customers won't see any bank transfer instructions until one is added.
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border border-neutral-800 p-3">
              <div>
                <div className="text-sm font-medium text-white">
                  {a.bankName} — {a.accountName}
                  {!a.active && (
                    <span className="ml-2 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">Inactive</span>
                  )}
                </div>
                <div className="text-xs text-neutral-400">
                  Account #{a.accountNumber}
                  {a.branch && ` — ${a.branch}`}
                </div>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(a)}
                    className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-black"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-600 hover:bg-red-950"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <BankAccountModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      {editing && (
        <BankAccountModal
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function BankAccountModal({
  account,
  onClose,
  onSaved,
}: {
  account?: BankAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [bankName, setBankName] = useState(account?.bankName ?? "");
  const [accountName, setAccountName] = useState(account?.accountName ?? "");
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? "");
  const [branch, setBranch] = useState(account?.branch ?? "");
  const [active, setActive] = useState(account?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const input = { bankName, accountName, accountNumber, branch: branch || undefined, active };
      if (account) {
        await bankAccountsApi.updateBankAccount(account.id, input);
      } else {
        await bankAccountsApi.createBankAccount(input);
      }
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={account ? "Edit Bank Account" : "New Bank Account"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Bank Name</label>
          <input
            required
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-300">Account Name</label>
          <input
            required
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Account Number</label>
            <input
              required
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Branch (optional)</label>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active (visible to customers)
        </label>
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : account ? "Save Changes" : "Create Bank Account"}
        </button>
      </form>
    </Modal>
  );
}
