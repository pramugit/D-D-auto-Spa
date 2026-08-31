import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as billingApi from "../api/billing";
import type { Invoice } from "../api/types";
import { apiErrorMessage, API_URL } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../hooks/useAuth";

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
      <h1 className="mb-2 text-2xl font-semibold text-slate-800">Invoices &amp; Payments</h1>
      {pendingCount > 0 && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {pendingCount} invoice{pendingCount === 1 ? "" : "s"} with a payment awaiting verification.
        </div>
      )}
      <div className="mb-4 flex gap-2">
        {["ALL", "UNPAID", "PARTIALLY_PAID", "PAID"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === s ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
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
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No invoices found.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => {
                const pending = inv.payments?.filter((p) => p.status === "PENDING_VERIFICATION").length ?? 0;
                return (
                  <tr key={inv.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-800">{inv.jobCard?.booking.customer?.name}</td>
                    <td className="px-4 py-2 text-slate-600">{inv.jobCard?.booking.vehicle?.plateNumber}</td>
                    <td className="px-4 py-2 text-slate-600">${inv.total}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {pending > 0 ? <span className="text-amber-600">{pending} pending</span> : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Link to={`/invoices/${inv.id}`} className="text-slate-700 hover:underline">
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
  const canVerify = user && ["ADMIN", "MANAGER"].includes(user.role);

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

  if (error) return <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>;
  if (!invoice) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <Link to="/invoices" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Back to Invoices
      </Link>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">
            Invoice — {invoice.jobCard?.booking.vehicle?.plateNumber}
          </h1>
          <StatusBadge status={invoice.status} />
        </div>
        <div className="text-sm text-slate-500">{invoice.jobCard?.booking.customer?.name}</div>
        <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
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
      </div>

      {notice && <div className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Payments</h2>
        {invoice.payments && invoice.payments.length > 0 ? (
          <div className="space-y-3">
            {invoice.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-slate-100 p-3">
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {p.method} — ${p.amount}
                  </div>
                  <div className="text-xs text-slate-400">{new Date(p.createdAt).toLocaleString()}</div>
                  {p.slipUrl && (
                    <a
                      href={`${API_URL}${p.slipUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-slate-600 hover:underline"
                    >
                      View uploaded slip
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  {canVerify && p.status === "PENDING_VERIFICATION" && (
                    <>
                      <button
                        onClick={() => handleVerify(p.id, "VERIFIED")}
                        className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                      >
                        Verify
                      </button>
                      <button
                        onClick={() => handleVerify(p.id, "REJECTED")}
                        className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-400">No payments submitted yet.</div>
        )}
      </div>
    </div>
  );
}
