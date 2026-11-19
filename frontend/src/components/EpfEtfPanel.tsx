import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as staffApi from "../api/staff";
import type { EpfReport, PayrollSettings } from "../api/staff";
import { apiErrorMessage } from "../api/client";

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * EPF / ETF for one month, from the generated payroll: each member's
 * earnings and contributions (employee EPF, employer EPF, ETF), totals to
 * pay, CSV exports for the EPF and ETF returns, and the rate settings.
 */
export function EpfEtfPanel({ month, canEdit }: { month: string; canEdit: boolean }) {
  const [r, setR] = useState<EpfReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      setR(await staffApi.getEpfReport(month));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  function download(kind: "epf" | "etf") {
    if (!r) return;
    const s = r.settings;
    const head =
      kind === "epf"
        ? ["Member name", "NIC", "EPF member no.", "Total earnings", `Employee ${s.epfEmployeeRate}%`, `Employer ${s.epfEmployerRate}%`, "Total contribution"]
        : ["Member name", "NIC", "EPF member no.", "Total earnings", `ETF ${s.etfRate}%`];
    const rows = r.members.map((m) =>
      kind === "epf"
        ? [m.name, m.nic ?? "", m.epfNumber ?? "", m.epfBase, m.epfEmployee, m.epfEmployer, Math.round((m.epfEmployee + m.epfEmployer) * 100) / 100]
        : [m.name, m.nic ?? "", m.epfNumber ?? "", m.epfBase, m.etfEmployer]
    );
    const total =
      kind === "epf"
        ? ["TOTAL", "", "", r.totals.earnings, r.totals.epfEmployee, r.totals.epfEmployer, r.totals.epfTotal]
        : ["TOTAL", "", "", r.totals.earnings, r.totals.etf];
    const lines = [
      [s.employerName, kind === "epf" ? `EPF reg. no: ${s.employerEpfNumber}` : `ETF reg. no: ${s.employerEtfNumber || s.employerEpfNumber}`],
      [`${kind.toUpperCase()} contributions — ${staffApi.monthLabel(month)}`],
      [],
      head,
      ...rows,
      total,
    ];
    const csv = lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${kind}-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (error) return <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</div>;
  if (!r) return <div className="text-neutral-500">Loading…</div>;
  const s = r.settings;

  return (
    <div className="space-y-4">
      {/* Totals to pay */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Members", String(r.members.length), ""],
          [`EPF employee ${s.epfEmployeeRate}%`, money(r.totals.epfEmployee), "deducted from pay"],
          [`EPF employer ${s.epfEmployerRate}%`, money(r.totals.epfEmployer), "paid by the business"],
          ["EPF total to pay", money(r.totals.epfTotal), `${s.epfEmployeeRate + s.epfEmployerRate}% to the EPF`],
          [`ETF ${s.etfRate}%`, money(r.totals.etf), "paid by the business"],
        ].map(([l, v, sub], i) => (
          <div key={l} className="rounded-xl bg-neutral-950 p-3 ring-1 ring-red-900/30 animate-pop-in" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">{l}</div>
            <div className="text-xl font-bold text-white">{v}</div>
            {sub && <div className="text-[10px] text-neutral-500">{sub}</div>}
          </div>
        ))}
      </div>

      {r.missingDetails.length > 0 && (
        <div className="rounded-md border border-yellow-900 bg-yellow-950/30 px-3 py-2 text-sm text-yellow-300">
          ▲ EPF number or NIC missing for: {r.missingDetails.join(", ")} — add them on the staff profile (Edit details) before filing.
        </div>
      )}
      {!s.employerEpfNumber && (
        <div className="rounded-md border border-yellow-900 bg-yellow-950/30 px-3 py-2 text-sm text-yellow-300">
          ▲ Your business's EPF registration number isn't set — open Settings below.
        </div>
      )}

      <section className="rounded-2xl bg-neutral-950 ring-1 ring-red-900/30">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-red-500">Contributions — {staffApi.monthLabel(month)}</h2>
            <p className="text-xs text-neutral-500">
              From this month's payroll. Earnings = basic salary earned (salary − unpaid days); overtime and bonuses aren't included.
            </p>
          </div>
          <div className="no-print flex gap-2">
            <button onClick={() => download("epf")} disabled={!r.members.length} className="rounded-full px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-900 disabled:opacity-40">
              ⭳ EPF CSV
            </button>
            <button onClick={() => download("etf")} disabled={!r.members.length} className="rounded-full px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-900 disabled:opacity-40">
              ⭳ ETF CSV
            </button>
            <button onClick={() => window.print()} disabled={!r.members.length} className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40">
              Print
            </button>
          </div>
        </div>
        {r.members.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            No payroll with EPF members for {staffApi.monthLabel(month)} yet.{" "}
            <Link to={`/payroll?month=${month}`} className="text-red-400 hover:underline">
              Generate payroll →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-red-500">
                <tr className="border-b border-neutral-800">
                  <th className="px-4 py-2">Member</th>
                  <th className="px-3 py-2">NIC</th>
                  <th className="px-3 py-2">EPF no.</th>
                  <th className="px-3 py-2 text-right">Earnings</th>
                  <th className="px-3 py-2 text-right">Employee {s.epfEmployeeRate}%</th>
                  <th className="px-3 py-2 text-right">Employer {s.epfEmployerRate}%</th>
                  <th className="px-3 py-2 text-right">EPF total</th>
                  <th className="px-4 py-2 text-right">ETF {s.etfRate}%</th>
                </tr>
              </thead>
              <tbody>
                {r.members.map((m, i) => (
                  <tr key={m.userId} className="border-b border-neutral-800/80 animate-row-in" style={{ animationDelay: `${i * 35}ms` }}>
                    <td className="px-4 py-2">
                      <Link to={`/users/${m.userId}?month=${month}`} className="font-medium text-white hover:text-red-400">
                        {m.name}
                      </Link>
                      <div className="text-[11px] text-neutral-500">
                        {m.employeeCode} · {m.status === "PAID" ? "salary paid" : "salary not paid yet"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-neutral-300">{m.nic || <span className="text-yellow-500">missing</span>}</td>
                    <td className="px-3 py-2 text-neutral-300">{m.epfNumber || <span className="text-yellow-500">missing</span>}</td>
                    <td className="px-3 py-2 text-right text-neutral-200">{money(m.epfBase)}</td>
                    <td className="px-3 py-2 text-right text-neutral-200">{money(m.epfEmployee)}</td>
                    <td className="px-3 py-2 text-right text-neutral-200">{money(m.epfEmployer)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-white">{money(m.epfEmployee + m.epfEmployer)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-white">{money(m.etfEmployer)}</td>
                  </tr>
                ))}
                <tr className="bg-black/60 font-bold text-white">
                  <td className="px-4 py-2" colSpan={3}>
                    Total
                  </td>
                  <td className="px-3 py-2 text-right">{money(r.totals.earnings)}</td>
                  <td className="px-3 py-2 text-right">{money(r.totals.epfEmployee)}</td>
                  <td className="px-3 py-2 text-right">{money(r.totals.epfEmployer)}</td>
                  <td className="px-3 py-2 text-right text-red-400">{money(r.totals.epfTotal)}</td>
                  <td className="px-4 py-2 text-right text-red-400">{money(r.totals.etf)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-neutral-500">
        {s.employerName}
        {s.employerEpfNumber && ` · EPF reg. ${s.employerEpfNumber}`}
        {s.employerEtfNumber && ` · ETF reg. ${s.employerEtfNumber}`} · Pay EPF and ETF by the last working day of the following month.
      </p>

      {canEdit && (
        <div className="no-print">
          <button onClick={() => setShowSettings((v) => !v)} className="text-xs text-red-400 hover:underline">
            {showSettings ? "Hide settings" : "⚙ Settings — rates & registration numbers"}
          </button>
          {showSettings && <SettingsForm initial={s} onSaved={load} />}
        </div>
      )}
    </div>
  );
}

function SettingsForm({ initial, onSaved }: { initial: PayrollSettings; onSaved: () => void }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cls = "mt-1 block w-full rounded-md border border-neutral-700 bg-black px-2 py-1.5 text-sm text-white focus:border-red-600 focus:outline-none";

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await staffApi.savePayrollSettings(s);
      setMsg({ ok: true, text: "Saved — use “Recalculate” on Payroll to apply new rates to unpaid months." });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 grid grid-cols-2 gap-3 rounded-2xl bg-neutral-950 p-4 ring-1 ring-red-900/30 md:grid-cols-3">
      <label className="text-xs text-neutral-400">
        EPF employee %
        <input type="number" step="0.1" min={0} max={50} value={s.epfEmployeeRate} onChange={(e) => setS({ ...s, epfEmployeeRate: Number(e.target.value) })} className={cls} />
      </label>
      <label className="text-xs text-neutral-400">
        EPF employer %
        <input type="number" step="0.1" min={0} max={50} value={s.epfEmployerRate} onChange={(e) => setS({ ...s, epfEmployerRate: Number(e.target.value) })} className={cls} />
      </label>
      <label className="text-xs text-neutral-400">
        ETF %
        <input type="number" step="0.1" min={0} max={50} value={s.etfRate} onChange={(e) => setS({ ...s, etfRate: Number(e.target.value) })} className={cls} />
      </label>
      <label className="text-xs text-neutral-400">
        Employer name
        <input value={s.employerName} onChange={(e) => setS({ ...s, employerName: e.target.value })} className={cls} />
      </label>
      <label className="text-xs text-neutral-400">
        EPF registration no.
        <input value={s.employerEpfNumber} onChange={(e) => setS({ ...s, employerEpfNumber: e.target.value })} className={cls} />
      </label>
      <label className="text-xs text-neutral-400">
        ETF registration no.
        <input value={s.employerEtfNumber} onChange={(e) => setS({ ...s, employerEtfNumber: e.target.value })} className={cls} />
      </label>
      <div className="col-span-full flex items-center gap-3">
        <button type="submit" className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
          Save settings
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
