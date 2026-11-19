import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import * as payrollApi from "../api/payroll";
import * as staffApi from "../api/staff";
import type { SalaryPayment } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { canEdit } from "../config/permissions";
import { Modal } from "../components/Modal";
import { BRAND } from "../config/brand";

const money = (n: number | string) =>
  `Rs. ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Payroll, worked out from attendance and leave (see backend
 * payrollService): days present, unpaid days (absences + unpaid leave)
 * deducted at the daily rate, overtime at 1.5×. Generate or recalculate any
 * time before paying; add a bonus or other deduction; print a payslip.
 */
export function PayrollPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? staffApi.currentMonth();
  const [records, setRecords] = useState<SalaryPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<SalaryPayment | null>(null);
  const [slip, setSlip] = useState<SalaryPayment | null>(null);
  const canManage = !!user && canEdit(user.role, "payroll");

  const load = useCallback(async () => {
    setError(null);
    try {
      setRecords(await payrollApi.listPayroll(month));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const setMonth = (m: string) => setParams(new URLSearchParams({ month: m }), { replace: true });

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      setRecords(await payrollApi.generatePayroll(month));
      setNotice("Payroll worked out from attendance and leave. Paid rows are never changed.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  async function markPaid(r: SalaryPayment) {
    if (!confirm(`Mark ${r.user.name}'s ${staffApi.monthLabel(month)} salary of ${money(r.netPay)} as paid? It can't be changed afterwards.`)) return;
    setPayingId(r.id);
    try {
      await payrollApi.markPayrollPaid(r.id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPayingId(null);
    }
  }

  const sum = (k: keyof SalaryPayment) => records.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const totalNet = sum("netPay");
  const paidNet = records.filter((r) => r.status === "PAID").reduce((s, r) => s + Number(r.netPay), 0);
  const pending = records.filter((r) => r.status === "PENDING").length;

  return (
    <div>
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 to-red-800 px-6 py-6 text-white shadow-lg shadow-red-950/40">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 animate-blob" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Payroll</p>
            <h1 className="mt-1 text-3xl font-bold">{staffApi.monthLabel(month)}</h1>
            <div className="mt-2 flex gap-2 text-xs">
              <Link to={`/users?month=${month}`} className="rounded-full bg-black/20 px-3 py-1 hover:bg-black/30">
                Staff →
              </Link>
              <Link to="/attendance" className="rounded-full bg-black/20 px-3 py-1 hover:bg-black/30">
                Attendance →
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              aria-label="Month"
              className="rounded-full bg-black/25 px-3 py-2 text-sm text-white ring-1 ring-white/30"
            />
            {canManage && (
              <button
                onClick={generate}
                disabled={generating}
                className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-red-700 transition hover:-translate-y-0.5 disabled:opacity-60"
              >
                {generating ? "Working out…" : records.length ? "↻ Recalculate" : "Generate payroll"}
              </button>
            )}
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-3">
          {[
            ["Net payroll", money(totalNet)],
            ["Paid", money(paidNet)],
            ["Still to pay", `${pending} staff · ${money(totalNet - paidNet)}`],
            ["Overtime", money(sum("overtimePay"))],
            ["Absence deductions", money(sum("absenceDeduction"))],
            ["EPF + ETF (employer)", money(sum("epfEmployer") + sum("etfEmployer"))],
          ].map(([l, v], i) => (
            <div key={l} className="rounded-xl bg-white/15 px-4 py-2 ring-1 ring-white/20">
              <div className="text-lg font-bold animate-count-pop" style={{ animationDelay: `${i * 60}ms` }}>
                {v}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-white/75">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {notice && <div className="mb-3 rounded-md bg-green-950 px-3 py-2 text-sm text-green-300">{notice}</div>}
      {error && <div className="mb-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300 ring-1 ring-red-900">{error}</div>}

      {records.length === 0 ? (
        <div className="rounded-2xl bg-neutral-950 p-8 text-center ring-1 ring-red-900/30">
          <p className="text-sm text-neutral-400">
            No payroll for {staffApi.monthLabel(month)} yet. “Generate payroll” works it out for every active staff member with a
            monthly salary, from their attendance and leave.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-neutral-950 ring-1 ring-red-900/30">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-red-500">
              <tr className="border-b border-neutral-800">
                <th className="px-4 py-3">Staff</th>
                <th className="px-3 py-3 text-right" title="Days present / working days">Present</th>
                <th className="px-3 py-3 text-right">Late</th>
                <th className="px-3 py-3 text-right" title="Absences + unpaid leave">Unpaid days</th>
                <th className="px-3 py-3 text-right">OT hrs</th>
                <th className="px-3 py-3 text-right">Base</th>
                <th className="px-3 py-3 text-right">+ OT</th>
                <th className="px-3 py-3 text-right">− Absence</th>
                <th className="px-3 py-3 text-right" title="Employee EPF contribution, deducted from pay">− EPF</th>
                <th className="px-3 py-3 text-right">± Adjust</th>
                <th className="px-3 py-3 text-right">Net pay</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => {
                const adj = Number(r.bonus) - Number(r.otherDeductions);
                return (
                  <tr key={r.id} className="border-b border-neutral-800/80 hover:bg-red-950/20 animate-row-in" style={{ animationDelay: `${i * 35}ms` }}>
                    <td className="px-4 py-3">
                      <Link to={`/users/${r.user.id}?month=${month}`} className="font-semibold text-white hover:text-red-400">
                        {r.user.name}
                      </Link>
                      <div className="text-[11px] text-neutral-500">
                        {r.user.employeeCode} · {r.user.role.charAt(0) + r.user.role.slice(1).toLowerCase()}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-neutral-200">
                      {r.daysPresent}/{r.workingDays}
                      {Number(r.paidLeaveDays) > 0 && <div className="text-[10px] text-sky-400">+{Number(r.paidLeaveDays)} paid leave</div>}
                    </td>
                    <td className={`px-3 py-3 text-right ${r.lateDays ? "text-yellow-400" : "text-neutral-500"}`}>{r.lateDays}</td>
                    <td className={`px-3 py-3 text-right ${Number(r.unpaidDays) ? "text-red-400" : "text-neutral-500"}`}>{Number(r.unpaidDays)}</td>
                    <td className="px-3 py-3 text-right text-neutral-300">{Number(r.overtimeHours)}</td>
                    <td className="px-3 py-3 text-right text-neutral-300">{money(r.baseSalary)}</td>
                    <td className="px-3 py-3 text-right text-green-400">{Number(r.overtimePay) ? money(r.overtimePay) : "—"}</td>
                    <td className="px-3 py-3 text-right text-red-400">{Number(r.absenceDeduction) ? money(r.absenceDeduction) : "—"}</td>
                    <td
                      className="px-3 py-3 text-right text-red-400"
                      title={Number(r.epfBase) ? `Employer also pays EPF ${money(r.epfEmployer)} + ETF ${money(r.etfEmployer)}` : "Not an EPF member"}
                    >
                      {Number(r.epfEmployee) ? money(r.epfEmployee) : "—"}
                    </td>
                    <td className={`px-3 py-3 text-right ${adj > 0 ? "text-green-400" : adj < 0 ? "text-red-400" : "text-neutral-500"}`} title={r.note ?? undefined}>
                      {adj ? `${adj > 0 ? "+" : "−"}${money(Math.abs(adj))}` : "—"}
                    </td>
                    <td className="px-3 py-3 text-right text-base font-bold text-white">{money(r.netPay)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 text-xs">
                        {r.status === "PAID" ? (
                          <span className="rounded-full bg-green-950 px-2 py-0.5 font-semibold text-green-300" title={r.paidAt ? `Paid ${new Date(r.paidAt).toLocaleDateString()}` : undefined}>
                            ✓ Paid
                          </span>
                        ) : (
                          canManage && (
                            <>
                              <button onClick={() => setAdjusting(r)} className="text-neutral-300 hover:text-white">
                                Adjust
                              </button>
                              <button
                                onClick={() => markPaid(r)}
                                disabled={payingId === r.id}
                                className="rounded-full bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                {payingId === r.id ? "…" : "Mark paid"}
                              </button>
                            </>
                          )
                        )}
                        <button onClick={() => setSlip(r)} className="text-neutral-400 hover:text-white">
                          Payslip
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        Daily rate = monthly salary ÷ working days (Mon–Sat). Unpaid days = absences without leave + unpaid leave. Overtime =
        hours beyond the staff member's shift, paid at 1.5× the hourly rate. EPF/ETF is on the basic salary earned — see
        Staff → EPF / ETF.
      </p>

      {adjusting && (
        <AdjustModal
          r={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            load();
          }}
        />
      )}
      {slip && <PayslipModal r={slip} month={month} onClose={() => setSlip(null)} />}
    </div>
  );
}

function AdjustModal({ r, onClose, onSaved }: { r: SalaryPayment; onClose: () => void; onSaved: () => void }) {
  const [bonus, setBonus] = useState(String(Number(r.bonus)));
  const [other, setOther] = useState(String(Number(r.otherDeductions)));
  const [note, setNote] = useState(r.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const net = Math.max(
    0,
    Number(r.baseSalary) + Number(r.overtimePay) + Number(bonus || 0) - Number(r.absenceDeduction) - Number(other || 0) - Number(r.epfEmployee)
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await staffApi.adjustPayroll(r.id, { bonus: Number(bonus || 0), otherDeductions: Number(other || 0), note: note || null });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  const cls = "mt-1 w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white focus:border-red-600 focus:outline-none";
  return (
    <Modal title={`Adjust — ${r.user.name}`} onClose={onClose} accent>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-neutral-400">
            Bonus / allowance (Rs.)
            <input type="number" min={0} step="0.01" value={bonus} onChange={(e) => setBonus(e.target.value)} className={cls} />
          </label>
          <label className="text-xs text-neutral-400">
            Other deductions (Rs.)
            <input type="number" min={0} step="0.01" value={other} onChange={(e) => setOther(e.target.value)} className={cls} />
          </label>
        </div>
        <label className="block text-xs text-neutral-400">
          Note (shown on the payslip)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. festival bonus, salary advance" className={cls} />
        </label>
        <div className="rounded-md bg-black px-3 py-2 text-sm text-neutral-300">
          Net pay becomes <span className="font-bold text-white">{money(net)}</span>
        </div>
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</div>}
        <button type="submit" className="w-full rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
          Save
        </button>
      </form>
    </Modal>
  );
}

/** Printable payslip (prints just the slip — see .no-print rules). */
function PayslipModal({ r, month, onClose }: { r: SalaryPayment; month: string; onClose: () => void }) {
  const line = (label: string, value: string, tone?: "plus" | "minus") => (
    <div className="flex justify-between py-1">
      <span className="text-slate-600">{label}</span>
      <span className={tone === "minus" ? "text-red-700" : tone === "plus" ? "text-green-700" : "text-slate-900"}>{value}</span>
    </div>
  );
  return (
    <Modal title="Payslip" onClose={onClose} wide>
      <div className="invoice-document rounded-lg bg-white p-6 text-sm text-slate-900">
        <div className="mb-4 flex items-start justify-between">
          <div className="inline-block rounded-lg bg-black px-3 py-2 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
            <img src={BRAND.logo} alt={BRAND.name} className="h-10 w-auto" />
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold uppercase tracking-wide text-slate-700">Payslip</div>
            <div className="text-slate-500">{staffApi.monthLabel(month)}</div>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-4 text-xs">
          <div>
            <div className="font-semibold uppercase text-slate-400">Employee</div>
            <div className="text-sm font-medium">{r.user.name}</div>
            <div className="text-slate-500">
              {r.user.employeeCode} · {r.user.role.charAt(0) + r.user.role.slice(1).toLowerCase()}
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold uppercase text-slate-400">Paid to</div>
            <div>{[r.user.bankName, r.user.bankAccount].filter(Boolean).join(" · ") || "—"}</div>
            <div className="text-slate-500">{r.status === "PAID" ? `Paid ${r.paidAt ? new Date(r.paidAt).toLocaleDateString() : ""}` : "Not paid yet"}</div>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-4 gap-2 rounded-md bg-slate-50 p-2 text-center text-xs">
          <div>
            <div className="font-semibold">{r.daysPresent}/{r.workingDays}</div>
            <div className="text-slate-500">days present</div>
          </div>
          <div>
            <div className="font-semibold">{Number(r.paidLeaveDays)}</div>
            <div className="text-slate-500">paid leave</div>
          </div>
          <div>
            <div className="font-semibold">{Number(r.unpaidDays)}</div>
            <div className="text-slate-500">unpaid days</div>
          </div>
          <div>
            <div className="font-semibold">{Number(r.overtimeHours)}</div>
            <div className="text-slate-500">overtime hrs</div>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {line("Basic salary", money(r.baseSalary))}
          {Number(r.overtimePay) > 0 && line("Overtime (1.5×)", `+ ${money(r.overtimePay)}`, "plus")}
          {Number(r.bonus) > 0 && line("Bonus / allowance", `+ ${money(r.bonus)}`, "plus")}
          {Number(r.absenceDeduction) > 0 && line(`Unpaid days (${Number(r.unpaidDays)})`, `− ${money(r.absenceDeduction)}`, "minus")}
          {Number(r.epfEmployee) > 0 && line("EPF — employee contribution", `− ${money(r.epfEmployee)}`, "minus")}
          {Number(r.otherDeductions) > 0 && line("Other deductions", `− ${money(r.otherDeductions)}`, "minus")}
        </div>
        <div className="mt-2 flex justify-between border-t-2 border-slate-800 pt-2 text-base font-bold">
          <span>Net pay</span>
          <span>{money(r.netPay)}</span>
        </div>
        {r.note && <div className="mt-2 text-xs text-slate-500">Note: {r.note}</div>}
        {Number(r.epfBase) > 0 && (
          <div className="mt-3 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
            Employer contributions (not deducted from your pay): EPF {money(r.epfEmployer)} · ETF {money(r.etfEmployer)}
            <br />
            EPF earnings {money(r.epfBase)}
            {r.user.epfNumber ? ` · EPF no. ${r.user.epfNumber}` : ""}
            {r.user.nic ? ` · NIC ${r.user.nic}` : ""}
          </div>
        )}
        <div className="mt-6 text-center text-xs text-slate-400">
          {BRAND.name} · {BRAND.address} · {BRAND.phones.join(" · ")}
        </div>
      </div>
      <div className="no-print mt-3 flex justify-end">
        <button onClick={() => window.print()} className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700">
          Print / Save as PDF
        </button>
      </div>
    </Modal>
  );
}
