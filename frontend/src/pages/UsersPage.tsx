import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import * as staffApi from "../api/staff";
import type { StaffRow } from "../api/staff";
import type { StaffRole } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { canEdit, canView } from "../config/permissions";
import { StaffFormModal } from "../components/StaffFormModal";
import { EpfEtfPanel } from "../components/EpfEtfPanel";

const ROLE_STYLE: Record<StaffRole, string> = {
  ADMIN: "bg-red-600 text-white",
  MANAGER: "bg-red-950 text-red-300 ring-1 ring-red-900",
  TECHNICIAN: "bg-neutral-800 text-neutral-200",
  RECEPTIONIST: "bg-neutral-800 text-neutral-300 ring-1 ring-neutral-700",
};

const NOW: Record<StaffRow["now"], { label: string; dot: string; text: string }> = {
  CLOCKED_IN: { label: "At work", dot: "bg-green-500", text: "text-green-400" },
  ON_LEAVE: { label: "On leave", dot: "bg-yellow-500", text: "text-yellow-400" },
  OFF: { label: "Not in", dot: "bg-neutral-500", text: "text-neutral-400" },
  INACTIVE: { label: "Inactive", dot: "bg-neutral-700", text: "text-neutral-500" },
};

const money = (n: number) => `Rs. ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/**
 * Staff management: everyone at a glance — who's at work right now, this
 * month's attendance (present / late / absent / hours), jobs done and
 * salary. Each row opens the staff profile (attendance calendar, leave,
 * payroll). Links straight to Attendance and Payroll.
 */
export function UsersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = !!user && canEdit(user.role, "staff");
  const seesPayroll = !!user && canView(user.role, "payroll");
  const [params] = useSearchParams();
  const [month, setMonth] = useState(params.get("month") ?? staffApi.currentMonth());
  const [data, setData] = useState<{ pendingLeaves: number; staff: StaffRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | StaffRole>("");
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<"staff" | "epf">(params.get("tab") === "epf" ? "epf" : "staff");

  const load = useCallback(async () => {
    try {
      setData(await staffApi.getStaffOverview(month));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [month]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000); // keep "at work" live
    return () => clearInterval(id);
  }, [load]);

  const staff = data?.staff ?? [];
  const shown = useMemo(
    () =>
      staff.filter(
        (s) =>
          (showInactive || s.active !== false) &&
          (!role || s.role === role) &&
          (!search.trim() ||
            [s.name, s.email, s.phone, s.employeeCode].some((v) => v?.toLowerCase().includes(search.trim().toLowerCase())))
      ),
    [staff, showInactive, role, search]
  );

  const active = staff.filter((s) => s.active !== false);
  const atWork = active.filter((s) => s.now === "CLOCKED_IN").length;
  const onLeave = active.filter((s) => s.now === "ON_LEAVE").length;
  const payrollCost = active.reduce((sum, s) => sum + Number(s.monthlySalary ?? 0), 0);
  const isThisMonth = month === staffApi.currentMonth();

  return (
    <div>
      {/* Hero */}
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 via-red-600 to-red-800 px-6 py-6 text-white shadow-lg shadow-red-950/40">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 animate-blob" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Staff management</p>
            <h1 className="mt-1 text-3xl font-bold">Team</h1>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Link to="/attendance" className="rounded-full bg-black/20 px-3 py-1 hover:bg-black/30">
                Attendance →
              </Link>
              {seesPayroll && (
                <Link to={`/payroll?month=${month}`} className="rounded-full bg-black/20 px-3 py-1 hover:bg-black/30">
                  Payroll →
                </Link>
              )}
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setAdding(true)}
              className="group rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-red-700 shadow-md transition hover:-translate-y-0.5"
            >
              <span className="mr-1 inline-block transition-transform duration-300 group-hover:rotate-90">+</span> Add staff
            </button>
          )}
        </div>
        <div className="relative mt-5 flex flex-wrap gap-3">
          {[
            { label: "Active staff", value: String(active.length) },
            { label: "At work now", value: String(atWork) },
            { label: "On leave today", value: String(onLeave) },
            ...(seesPayroll ? [{ label: "Monthly salaries", value: money(payrollCost) }] : []),
            { label: "Leave requests", value: String(data?.pendingLeaves ?? 0) },
          ].map((k, i) => (
            <div key={k.label} className="rounded-xl bg-white/15 px-4 py-2 ring-1 ring-white/20 backdrop-blur-sm">
              <div className="text-xl font-bold animate-count-pop" style={{ animationDelay: `${i * 70}ms` }}>
                {data ? k.value : "…"}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-white/75">{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300 ring-1 ring-red-900">{error}</div>}

      {seesPayroll && (
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-neutral-800">
          <div className="flex">
            {(
              [
                ["staff", "Staff"],
                ["epf", "EPF / ETF"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                  view === k ? "border-red-600 text-white" : "border-transparent text-neutral-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "epf" && (
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              aria-label="Month"
              className="mb-1 rounded-md border border-neutral-700 bg-black px-2 py-1 text-xs text-white"
            />
          )}
        </div>
      )}

      {view === "epf" && seesPayroll ? (
        <EpfEtfPanel month={month} canEdit={isAdmin} />
      ) : (
      <>
      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, email or code…"
          aria-label="Search staff"
          className="w-full max-w-xs rounded-full border border-neutral-700 bg-black px-4 py-2 text-sm text-white focus:border-red-600 focus:outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "" | StaffRole)}
          aria-label="Role"
          className="rounded-full border border-neutral-700 bg-black px-3 py-2 text-sm text-white"
        >
          <option value="">All roles</option>
          {(["ADMIN", "MANAGER", "TECHNICIAN", "RECEPTIONIST"] as StaffRole[]).map((r) => (
            <option key={r} value={r}>
              {r.charAt(0) + r.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          aria-label="Month"
          className="rounded-full border border-neutral-700 bg-black px-3 py-2 text-sm text-white"
        />
        <label className="ml-1 flex items-center gap-2 text-xs text-neutral-400">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-red-600" />
          Show inactive
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl bg-neutral-950 ring-1 ring-red-900/30">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-red-500">
            <tr className="border-b border-neutral-800">
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Now</th>
              <th className="px-4 py-3 text-right" title="Days present this month">Present</th>
              <th className="px-4 py-3 text-right">Late</th>
              <th className="px-4 py-3 text-right" title={isThisMonth ? "Working days missed so far" : "Working days missed"}>Absent</th>
              <th className="px-4 py-3 text-right">Leave</th>
              <th className="px-4 py-3 text-right">Hours</th>
              <th className="px-4 py-3 text-right">Jobs</th>
              {seesPayroll && <th className="px-4 py-3 text-right">Salary</th>}
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-neutral-500">
                  Loading…
                </td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-neutral-500">
                  No staff match.
                </td>
              </tr>
            ) : (
              shown.map((s, i) => {
                const now = NOW[s.now];
                return (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/users/${s.id}?month=${month}`)}
                    className={`group cursor-pointer border-b border-neutral-800/80 transition-colors hover:bg-red-950/30 animate-row-in ${
                      s.active === false ? "opacity-50" : ""
                    }`}
                    style={{ animationDelay: `${Math.min(i, 15) * 35}ms` }}
                  >
                    <td className="px-4 py-3">
                      <Link to={`/users/${s.id}?month=${month}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-700 text-xs font-bold text-white transition-transform group-hover:scale-110">
                          {staffApi.initials(s.name)}
                        </span>
                        <span>
                          <span className="block font-semibold text-white group-hover:text-red-400">{s.name}</span>
                          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                            <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${ROLE_STYLE[s.role]}`}>
                              {s.role.charAt(0) + s.role.slice(1).toLowerCase()}
                            </span>
                            {s.employeeCode}
                            {s.phone && <span>· {s.phone}</span>}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 text-xs ${now.text}`}>
                        <span className={`h-2 w-2 rounded-full ${now.dot} ${s.now === "CLOCKED_IN" ? "animate-pulse" : ""}`} />
                        {now.label}
                        {s.clockedInAt && (
                          <span className="text-neutral-500">
                            since {new Date(s.clockedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {s.leaveToday && <span className="text-neutral-500">({staffApi.LEAVE_LABEL[s.leaveToday]})</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-white">{s.stats.daysPresent}</td>
                    <td className={`px-4 py-3 text-right ${s.stats.lateDays ? "text-yellow-400" : "text-neutral-500"}`}>{s.stats.lateDays}</td>
                    <td className={`px-4 py-3 text-right ${s.stats.absentDays ? "text-red-400" : "text-neutral-500"}`}>{s.stats.absentDays}</td>
                    <td className="px-4 py-3 text-right text-neutral-300">{s.stats.paidLeaveDays + s.stats.unpaidLeaveDays}</td>
                    <td className="px-4 py-3 text-right text-neutral-300">{s.stats.hoursWorked}</td>
                    <td className="px-4 py-3 text-right text-neutral-300">{s.jobsCompleted}</td>
                    {seesPayroll && (
                      <td className="px-4 py-3 text-right text-neutral-300">
                        {s.monthlySalary ? money(Number(s.monthlySalary)) : <span className="text-neutral-600">—</span>}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Working days are Monday–Saturday. Late = clocked in more than 10 minutes after the shift start. Absent = a working
        day with no clock-in and no approved leave{isThisMonth ? " (counted up to yesterday)" : ""}.
      </p>
      </>
      )}

      {adding && (
        <StaffFormModal
          showPay={seesPayroll}
          onClose={() => setAdding(false)}
          onSaved={(s) => {
            setAdding(false);
            navigate(`/users/${s.id}`);
          }}
        />
      )}
    </div>
  );
}
