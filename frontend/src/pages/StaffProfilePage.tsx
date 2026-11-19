import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import * as staffApi from "../api/staff";
import * as usersApi from "../api/users";
import type { DaySummary, LeaveType, StaffProfile } from "../api/staff";
import type { AttendanceRecord } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { canEdit, canView } from "../config/permissions";
import { StaffFormModal } from "../components/StaffFormModal";

type Tab = "overview" | "attendance" | "leave" | "payroll";

const money = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
/** "2026-11-03T00:00:00Z" date column → local "3 Nov 2026" without timezone drift. */
const fmtDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const DAY_STYLE: Record<DaySummary["status"], { cls: string; label: string }> = {
  present: { cls: "bg-green-950 text-green-300 ring-1 ring-green-900", label: "Present" },
  late: { cls: "bg-yellow-950 text-yellow-300 ring-1 ring-yellow-800", label: "Late" },
  absent: { cls: "bg-red-950 text-red-300 ring-1 ring-red-900", label: "Absent" },
  leave: { cls: "bg-sky-950 text-sky-300 ring-1 ring-sky-900", label: "Leave" },
  off: { cls: "bg-neutral-900 text-neutral-600", label: "Sunday" },
  future: { cls: "bg-neutral-950 text-neutral-700 ring-1 ring-neutral-900", label: "Upcoming" },
  today: { cls: "bg-black text-white ring-2 ring-red-600", label: "Today" },
  before: { cls: "bg-neutral-950 text-neutral-800", label: "Before joining" },
};

/**
 * One staff member: details, this month's attendance as a calendar (with
 * corrections), leave (request / approve), jobs done, and payroll history.
 */
export function StaffProfilePage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = !!user && canEdit(user.role, "staff");
  const seesPayroll = !!user && canView(user.role, "payroll");
  const canFix = !!user && ["ADMIN", "MANAGER"].includes(user.role);
  const month = params.get("month") ?? staffApi.currentMonth();
  const [tab, setTab] = useState<Tab>("overview");
  const [p, setP] = useState<StaffProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setP(await staffApi.getStaffProfile(id, month));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [id, month]);

  useEffect(() => {
    load();
  }, [load]);

  const setMonth = (m: string) => {
    const next = new URLSearchParams(params);
    next.set("month", m);
    setParams(next, { replace: true });
  };

  async function toggleActive() {
    if (!p) return;
    const deactivate = p.user.active !== false;
    if (
      deactivate &&
      !confirm(`Deactivate ${p.user.name}? They won't be able to log in, and won't appear in technician lists or new payroll. Their history is kept.`)
    )
      return;
    try {
      await usersApi.updateUser(p.user.id, { active: !deactivate });
      setNotice(deactivate ? `${p.user.name} deactivated` : `${p.user.name} reactivated`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  if (error && !p) return <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</div>;
  if (!p) return <div className="text-neutral-500">Loading…</div>;

  const u = p.user;
  const s = p.summary;

  return (
    <div>
      <Link to={`/users?month=${month}`} className="mb-3 inline-block text-sm text-neutral-400 hover:text-white">
        ← All staff
      </Link>

      {/* Header */}
      <div className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 to-red-800 px-6 py-5 text-white shadow-lg shadow-red-950/40">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 animate-blob" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-xl font-bold text-red-700 shadow-lg">
              {staffApi.initials(u.name)}
            </span>
            <div>
              <h1 className="text-2xl font-bold">{u.name}</h1>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-white/85">
                <span>{u.role.charAt(0) + u.role.slice(1).toLowerCase()}</span>
                {u.employeeCode && <span>{u.employeeCode}</span>}
                {u.joinedAt && <span>joined {fmtDay(u.joinedAt)}</span>}
                <span>
                  shift {u.shiftStart}–{u.shiftEnd}
                </span>
                {u.active === false && <span className="rounded-full bg-black/30 px-2 text-xs font-semibold">INACTIVE</span>}
              </div>
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <button onClick={() => setEditing(true)} className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:-translate-y-0.5 transition">
                Edit details
              </button>
              <button onClick={toggleActive} className="rounded-full bg-black/25 px-4 py-2 text-xs font-semibold ring-1 ring-white/30 hover:bg-black/40">
                {u.active === false ? "Reactivate" : "Deactivate"}
              </button>
            </div>
          )}
        </div>
      </div>

      {notice && <div className="mb-3 rounded-md bg-green-950 px-3 py-2 text-sm text-green-300">{notice}</div>}
      {error && <div className="mb-3 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</div>}

      {/* Tabs + month */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800">
        <div className="flex">
          {(
            [
              ["overview", "Overview"],
              ["attendance", "Attendance"],
              ["leave", `Leave${p.leaves.some((l) => l.status === "PENDING") ? " •" : ""}`],
              ...(seesPayroll ? [["payroll", "Payroll"]] : []),
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                tab === k ? "border-red-600 text-white" : "border-transparent text-neutral-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          aria-label="Month"
          className="mb-1 rounded-md border border-neutral-700 bg-black px-2 py-1 text-xs text-white"
        />
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label="Present" value={s.daysPresent} sub={`of ${s.workingDays} working days`} />
            <Stat label="Late" value={s.lateDays} tone={s.lateDays ? "warn" : undefined} />
            <Stat label="Absent" value={s.absentDays} tone={s.absentDays ? "bad" : undefined} />
            <Stat label="Leave" value={s.paidLeaveDays + s.unpaidLeaveDays} sub={s.unpaidLeaveDays ? `${s.unpaidLeaveDays} unpaid` : undefined} />
            <Stat label="Hours" value={s.hoursWorked} />
            <Stat label="Overtime" value={s.overtimeHours} sub="hours" />
            <Stat label="Jobs done" value={p.jobs.count} />
            <Stat label="Avg job" value={p.jobs.avgMinutes ?? "—"} sub={p.jobs.avgMinutes !== null ? "minutes" : undefined} />
          </div>
          {s.missingClockOuts > 0 && (
            <div className="rounded-md border border-yellow-900 bg-yellow-950/30 px-3 py-2 text-sm text-yellow-300">
              ▲ {s.missingClockOuts} day(s) have no clock-out, so their hours don't count. Fix them on the Attendance tab.
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Contact">
              <Info label="Phone" value={u.phone} />
              <Info label="Email" value={u.email} />
              <Info label="Address" value={u.address} />
              {isAdmin && <Info label="NIC" value={u.nic} />}
            </Card>
            <Card title="Emergency contact">
              <Info label="Name" value={u.emergencyName} />
              <Info label="Phone" value={u.emergencyPhone} />
            </Card>
            {seesPayroll && (
              <Card title={`Pay — ${staffApi.monthLabel(month)}`}>
                <Info label="Monthly salary" value={u.monthlySalary ? money(Number(u.monthlySalary)) : "Not on payroll"} />
                {p.payEstimate && (
                  <>
                    <Info label="Daily rate" value={money(p.payEstimate.dailyRate)} />
                    <Info label="Overtime (1.5×)" value={`+ ${money(p.payEstimate.overtimePay)}`} />
                    <Info label={`Unpaid days (${s.unpaidDays})`} value={`− ${money(p.payEstimate.absenceDeduction)}`} />
                    {p.payEstimate.epfEmployee > 0 && <Info label="EPF (employee)" value={`− ${money(p.payEstimate.epfEmployee)}`} />}
                    <div className="mt-2 flex justify-between border-t border-neutral-800 pt-2 text-sm">
                      <span className="text-neutral-300">Net so far</span>
                      <span className="font-bold text-white">{money(p.payEstimate.netPay)}</span>
                    </div>
                  </>
                )}
                <Info label="Bank" value={[u.bankName, u.bankAccount].filter(Boolean).join(" · ") || null} />
                <Info label="EPF / ETF" value={u.epfMember === false ? "Not a member" : u.epfNumber ? `Member · ${u.epfNumber}` : "Member · no EPF number yet"} />
                {p.payEstimate && p.payEstimate.epfEmployer > 0 && (
                  <div className="text-[11px] text-neutral-500">
                    Employer pays EPF {money(p.payEstimate.epfEmployer)} + ETF {money(p.payEstimate.etfEmployer)} on top.
                  </div>
                )}
                <Link to={`/payroll?month=${month}`} className="mt-2 inline-block text-xs text-red-400 hover:underline">
                  Open payroll →
                </Link>
              </Card>
            )}
          </div>
          <Card title="Recent jobs this month">
            {p.jobs.recent.length === 0 ? (
              <div className="text-sm text-neutral-500">No completed jobs this month.</div>
            ) : (
              <ul className="divide-y divide-neutral-800 text-sm">
                {p.jobs.recent.map((j) => (
                  <li key={j.id} className="flex justify-between py-1.5">
                    <Link to={`/job-board/${j.id}`} className="text-white hover:text-red-400">
                      {j.plate} <span className="text-neutral-500">— {j.customer}</span>
                    </Link>
                    <span className="text-xs text-neutral-500">
                      {j.isWalkIn ? "Daily" : "Booking"} · {fmtDate(j.completedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "attendance" && <AttendanceTab p={p} canFix={canFix} onChanged={load} />}
      {tab === "leave" && <LeaveTab p={p} canDecide={canFix} onChanged={load} />}
      {tab === "payroll" && seesPayroll && (
        <Card title="Payroll history">
          {!p.salary || p.salary.length === 0 ? (
            <div className="text-sm text-neutral-500">No payroll generated yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-red-500">
                  <tr>
                    <th className="py-2">Month</th>
                    <th className="py-2 text-right">Present</th>
                    <th className="py-2 text-right">Unpaid days</th>
                    <th className="py-2 text-right">Overtime</th>
                    <th className="py-2 text-right">EPF</th>
                    <th className="py-2 text-right">Net pay</th>
                    <th className="py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {p.salary.map((r) => {
                    const m = r.month.slice(0, 7);
                    return (
                      <tr key={r.id} className="border-t border-neutral-800">
                        <td className="py-1.5">
                          <Link to={`/payroll?month=${m}`} className="text-white hover:text-red-400">
                            {staffApi.monthLabel(m)}
                          </Link>
                        </td>
                        <td className="py-1.5 text-right text-neutral-300">
                          {r.daysPresent}/{r.workingDays}
                        </td>
                        <td className="py-1.5 text-right text-neutral-300">{Number(r.unpaidDays)}</td>
                        <td className="py-1.5 text-right text-neutral-300">{money(Number(r.overtimePay))}</td>
                        <td className="py-1.5 text-right text-neutral-300">{Number(r.epfEmployee) ? money(Number(r.epfEmployee)) : "—"}</td>
                        <td className="py-1.5 text-right font-semibold text-white">{money(Number(r.netPay))}</td>
                        <td className={`py-1.5 text-right text-xs ${r.status === "PAID" ? "text-green-400" : "text-yellow-400"}`}>{r.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {editing && (
        <StaffFormModal
          staff={u}
          showPay={seesPayroll}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice("Details saved");
            load();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: "warn" | "bad" }) {
  return (
    <div className="rounded-xl bg-neutral-950 p-3 ring-1 ring-red-900/30 animate-pop-in">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`text-xl font-bold ${tone === "bad" ? "text-red-400" : tone === "warn" ? "text-yellow-400" : "text-white"}`}>{value}</div>
      {sub && <div className="text-[10px] text-neutral-500">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-neutral-950 p-4 ring-1 ring-red-900/30">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-500">{title}</h2>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right text-neutral-200">{value || <span className="text-neutral-600">—</span>}</span>
    </div>
  );
}

const inputCls = "rounded-md border border-neutral-700 bg-black px-2 py-1.5 text-sm text-white focus:border-red-600 focus:outline-none";

/** Local "YYYY-MM-DDTHH:MM" for <input type="datetime-local">. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function AttendanceTab({ p, canFix, onChanged }: { p: StaffProfile; canFix: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [inAt, setInAt] = useState("");
  const [outAt, setOutAt] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const days = p.summary.days;
  const lead = (new Date(`${days[0].date}T00:00`).getDay() + 6) % 7; // Monday-first grid

  function startEdit(r: AttendanceRecord | null, date?: string) {
    setEditing(r);
    setInAt(r ? toLocalInput(r.clockIn) : `${date ?? new Date().toISOString().slice(0, 10)}T${p.user.shiftStart ?? "08:00"}`);
    setOutAt(r?.clockOut ? toLocalInput(r.clockOut) : date ? `${date}T${p.user.shiftEnd ?? "18:00"}` : "");
    setMsg(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const body = { clockIn: new Date(inAt).toISOString(), clockOut: outAt ? new Date(outAt).toISOString() : null };
      if (editing) await staffApi.updateAttendanceRecord(editing.id, body);
      else await staffApi.addAttendanceRecord({ userId: p.user.id, ...body });
      setMsg({ ok: true, text: "Saved" });
      setInAt("");
      setEditing(null);
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    }
  }

  async function remove(r: AttendanceRecord) {
    if (!confirm("Delete this attendance record?")) return;
    try {
      await staffApi.deleteAttendanceRecord(r.id);
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    }
  }

  return (
    <div className="space-y-4">
      <Card title={`Calendar — ${staffApi.monthLabel(p.summary.month)}`}>
        <div className="grid max-w-2xl grid-cols-7 gap-1.5 text-center text-[10px] uppercase text-neutral-500">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d}>{d}</div>
          ))}
          {Array.from({ length: lead }).map((_, i) => (
            <div key={`x${i}`} />
          ))}
          {days.map((d, i) => {
            const st = DAY_STYLE[d.status];
            const clickable = canFix && d.status !== "future" && d.status !== "before";
            return (
              <button
                key={d.date}
                type="button"
                disabled={!clickable}
                onClick={() => startEdit(null, d.date)}
                title={`${d.date} — ${st.label}${d.leaveType ? ` (${staffApi.LEAVE_LABEL[d.leaveType]})` : ""}${d.firstIn ? ` · in ${time(d.firstIn)}` : ""}${d.lastOut ? ` · out ${time(d.lastOut)}` : ""}${d.missingClockOut ? " · no clock-out" : ""}${clickable ? " — click to add a record" : ""}`}
                className={`flex h-14 flex-col items-center justify-center rounded-lg text-xs normal-case transition animate-pop-in ${st.cls} ${clickable ? "hover:scale-105" : "cursor-default"}`}
                style={{ animationDelay: `${i * 12}ms` }}
              >
                <span className="font-semibold">{Number(d.date.slice(8))}</span>
                <span className="text-[9px] opacity-80">
                  {d.hours ? `${d.hours}h` : d.status === "leave" && d.leaveType ? staffApi.LEAVE_LABEL[d.leaveType] : d.status === "absent" ? "absent" : ""}
                  {d.missingClockOut ? " !" : ""}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-neutral-400">
          {(["present", "late", "absent", "leave", "today", "off"] as DaySummary["status"][]).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`h-3 w-3 rounded ${DAY_STYLE[k].cls}`} />
              {DAY_STYLE[k].label}
            </span>
          ))}
        </div>
      </Card>

      {canFix && (
        <Card title={editing ? "Fix attendance record" : "Add attendance record"}>
          <form onSubmit={save} className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-neutral-400">
              Clock in
              <input type="datetime-local" required value={inAt} onChange={(e) => setInAt(e.target.value)} className={`mt-1 block ${inputCls}`} />
            </label>
            <label className="text-xs text-neutral-400">
              Clock out
              <input type="datetime-local" value={outAt} onChange={(e) => setOutAt(e.target.value)} className={`mt-1 block ${inputCls}`} />
            </label>
            <button type="submit" className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
              {editing ? "Save fix" : "Add record"}
            </button>
            {(editing || inAt) && (
              <button type="button" onClick={() => { setEditing(null); setInAt(""); setOutAt(""); }} className="text-xs text-neutral-400 hover:text-white">
                Cancel
              </button>
            )}
            {msg && <span className={`text-xs ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</span>}
          </form>
          <p className="mt-1 text-[11px] text-neutral-500">Tip: click a day on the calendar to start a record for that day.</p>
        </Card>
      )}

      <Card title="Clock-ins this month">
        {p.records.length === 0 ? (
          <div className="text-sm text-neutral-500">No clock-ins this month.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="py-1.5">Day</th>
                <th className="py-1.5">In</th>
                <th className="py-1.5">Out</th>
                <th className="py-1.5 text-right">Hours</th>
                {canFix && <th />}
              </tr>
            </thead>
            <tbody>
              {p.records.map((r) => {
                const hrs = r.clockOut ? (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 3600000 : null;
                return (
                  <tr key={r.id} className="border-t border-neutral-800">
                    <td className="py-1.5 text-neutral-300">{fmtDate(r.clockIn)}</td>
                    <td className="py-1.5 text-white">{time(r.clockIn)}</td>
                    <td className="py-1.5">{r.clockOut ? <span className="text-white">{time(r.clockOut)}</span> : <span className="text-yellow-400">not clocked out</span>}</td>
                    <td className="py-1.5 text-right text-neutral-300">{hrs !== null ? hrs.toFixed(1) : "—"}</td>
                    {canFix && (
                      <td className="py-1.5 text-right text-xs">
                        <button onClick={() => startEdit(r)} className="mr-3 text-neutral-300 hover:text-white">
                          Fix
                        </button>
                        <button onClick={() => remove(r)} className="text-red-400 hover:text-red-300">
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function LeaveTab({ p, canDecide, onChanged }: { p: StaffProfile; canDecide: boolean; onChanged: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<LeaveType>("ANNUAL");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("");
  const [approve, setApprove] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await staffApi.createLeave({ userId: p.user.id, type, startDate: from, endDate: to, reason: reason || undefined, approve: canDecide && approve });
      setMsg({ ok: true, text: "Leave added" });
      setReason("");
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    }
  }

  async function decide(id: string, status: "APPROVED" | "REJECTED") {
    try {
      await staffApi.decideLeave(id, status);
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this leave?")) return;
    try {
      await staffApi.deleteLeave(id);
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Add leave">
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-neutral-400">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as LeaveType)} className={`mt-1 block ${inputCls}`}>
              {(Object.keys(staffApi.LEAVE_LABEL) as LeaveType[]).map((t) => (
                <option key={t} value={t}>
                  {staffApi.LEAVE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-400">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`mt-1 block ${inputCls}`} />
          </label>
          <label className="text-xs text-neutral-400">
            To
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`mt-1 block ${inputCls}`} />
          </label>
          <label className="min-w-[180px] flex-1 text-xs text-neutral-400">
            Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={`mt-1 block w-full ${inputCls}`} />
          </label>
          {canDecide && (
            <label className="flex items-center gap-1.5 pb-2 text-xs text-neutral-300">
              <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} className="accent-red-600" />
              Approve now
            </label>
          )}
          <button type="submit" className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
            Add
          </button>
          {msg && <span className={`text-xs ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</span>}
        </form>
        <p className="mt-1 text-[11px] text-neutral-500">Annual, casual and sick leave is paid. Unpaid leave is deducted in payroll, like an absence.</p>
      </Card>

      <Card title="Leave history">
        {p.leaves.length === 0 ? (
          <div className="text-sm text-neutral-500">No leave recorded.</div>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {p.leaves.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <span className="font-medium text-white">{staffApi.LEAVE_LABEL[l.type]}</span>{" "}
                  <span className="text-neutral-400">
                    {fmtDay(l.startDate)}
                    {l.endDate.slice(0, 10) !== l.startDate.slice(0, 10) && ` – ${fmtDay(l.endDate)}`}
                  </span>
                  {l.reason && <div className="text-xs text-neutral-500">{l.reason}</div>}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${
                      l.status === "APPROVED" ? "bg-green-950 text-green-300" : l.status === "REJECTED" ? "bg-neutral-800 text-neutral-400" : "bg-yellow-950 text-yellow-300"
                    }`}
                  >
                    {l.status === "PENDING" ? "Waiting" : l.status === "APPROVED" ? "Approved" : "Rejected"}
                  </span>
                  {canDecide && l.status === "PENDING" && (
                    <>
                      <button onClick={() => decide(l.id, "APPROVED")} className="rounded-full bg-green-700 px-2.5 py-0.5 font-semibold text-white hover:bg-green-600">
                        Approve
                      </button>
                      <button onClick={() => decide(l.id, "REJECTED")} className="rounded-full px-2.5 py-0.5 text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-900">
                        Reject
                      </button>
                    </>
                  )}
                  {canDecide && (
                    <button onClick={() => remove(l.id)} className="text-neutral-500 hover:text-red-400" aria-label="Remove leave">
                      ✕
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
