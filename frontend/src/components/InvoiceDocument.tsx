import { formatMileage, vehicleTypeLabel } from "../config/vehicleTypes";
import type { Invoice } from "../api/types";
import { formatMoney } from "../utils/money";
import { BRAND } from "../config/brand";

/** Formats an invoice's sequential number as "INV-000123". */
function formatInvoiceNumber(n: number): string {
  return `INV-${String(n).padStart(6, "0")}`;
}

/**
 * The professional, printable invoice/receipt document — shared between the
 * Admin Portal's Invoice Detail page and the customer portal's booking
 * detail page, so a customer and staff see byte-for-byte the same document.
 * Print/download is just the browser's native print-to-PDF over this view
 * (see the `.no-print` rule in index.css, which hides everything else on
 * the page — sidebar, nav, buttons — leaving only this document).
 */
export function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const booking = invoice.jobCard?.booking;
  const customer = booking?.customer;
  const vehicle = booking?.vehicle;
  const verifiedPayments = invoice.payments?.filter((p) => p.status === "VERIFIED") ?? [];
  const paidTotal = verifiedPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balanceDue = Math.max(0, Number(invoice.total) - paidTotal);

  // Customer-approved damage repairs and externally-bought parts are both
  // billable extras on top of the booked services — see
  // invoiceService.createInvoiceForJobCard for how they're totalled.
  const approvedRepairs = (invoice.jobCard?.damageInspections ?? []).flatMap((insp) =>
    insp.markings.filter((m) => m.isAdditionalRepairOffer && m.approvalStatus === "APPROVED")
  );
  const externalParts = (invoice.jobCard?.inventoryUsages ?? []).filter((u) => u.sourceType === "EXTERNAL_PURCHASE");

  return (
    <div className="invoice-document relative overflow-hidden rounded-lg border border-slate-200 bg-white p-8">
      {invoice.status === "PAID" && (
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
          <div className="-rotate-12 rounded-lg border-8 border-red-600 px-10 py-4 text-7xl font-bold uppercase tracking-widest text-red-600 opacity-10">
            Paid
          </div>
        </div>
      )}

      <div className="relative z-10 mb-8 flex items-start justify-between">
        <div>
          {/* The logo is white + red artwork, so it sits on a black badge on the white page. */}
          <div className="inline-block rounded-lg bg-black px-3 py-2 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
            <img src={BRAND.logo} alt={BRAND.name} className="h-12 w-auto" />
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {BRAND.address}
            <br />
            {BRAND.phones.join(" · ")}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold uppercase tracking-wide text-slate-700">Tax Invoice</div>
          <div className="text-sm text-slate-500">{formatInvoiceNumber(invoice.invoiceNumber)}</div>
          <div className="text-xs text-slate-400">Issued {new Date(invoice.createdAt).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Bill To</div>
          <div className="font-medium text-slate-800">{customer?.name ?? "—"}</div>
          {customer?.phone && <div className="text-slate-500">{customer.phone}</div>}
          {customer?.email && <div className="text-slate-500">{customer.email}</div>}
          {customer?.address && <div className="text-slate-500">{customer.address}</div>}
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Vehicle</div>
          <div className="font-medium text-slate-800">{vehicle?.plateNumber ?? "—"}</div>
          {vehicle && (
            <div className="text-slate-500">
              {vehicle.make} {vehicle.model} ({vehicleTypeLabel(vehicle.vehicleType)})
            </div>
          )}
          {booking?.mileage != null && <div className="text-slate-500">Mileage: {formatMileage(booking.mileage)}</div>}
          {booking?.scheduledAt && (
            <div className="mt-2 text-slate-500">
              Service date: {new Date(booking.scheduledAt).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {booking?.services?.map((s) => (
            <tr key={s.id} className="border-b border-slate-100">
              <td className="py-2 text-slate-700">{s.service?.name ?? s.package?.name}</td>
              <td className="py-2 text-right text-slate-700">{formatMoney(s.price)}</td>
            </tr>
          ))}
          {approvedRepairs.map((m) => (
            <tr key={m.id} className="border-b border-slate-100">
              <td className="py-2 text-slate-700">Repair — {m.damageType?.name ?? m.note ?? "Additional repair"}</td>
              <td className="py-2 text-right text-slate-700">{formatMoney(m.suggestedPrice)}</td>
            </tr>
          ))}
          {externalParts.map((u) => (
            <tr key={u.id} className="border-b border-slate-100">
              <td className="py-2 text-slate-700">
                Part — {u.externalName} × {u.quantityUsed}
              </td>
              <td className="py-2 text-right text-slate-700">
                {formatMoney(Number(u.quantityUsed) * Number(u.externalCost ?? 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-6 flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{formatMoney(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Tax</span>
            <span>{formatMoney(invoice.tax)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Discount</span>
            <span>− {formatMoney(invoice.discount)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold text-slate-900">
            <span>Total</span>
            <span>{formatMoney(invoice.total)}</span>
          </div>
          {paidTotal > 0 && (
            <>
              <div className="flex justify-between text-slate-600">
                <span>Paid</span>
                <span>{formatMoney(paidTotal)}</span>
              </div>
              <div className="flex justify-between font-medium text-slate-900">
                <span>Balance Due</span>
                <span>{formatMoney(balanceDue)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {verifiedPayments.length > 0 && (
        <div className="border-t border-slate-200 pt-4">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Payments Received</div>
          <table className="w-full text-sm">
            <tbody>
              {verifiedPayments.map((p) => (
                <tr key={p.id} className="text-slate-600">
                  <td className="py-1">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="py-1">{p.method.replace(/_/g, " ")}</td>
                  <td className="py-1 text-right">{formatMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 text-center text-xs text-slate-400">Thank you for choosing {BRAND.name} — {BRAND.slogan}</div>
    </div>
  );
}

export function PrintInvoiceButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      Print / Save as PDF
    </button>
  );
}
