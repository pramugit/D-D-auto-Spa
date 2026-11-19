import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as staffApi from "../api/staff";
import type { LeaveType, StaffLeave } from "../api/staff";
import * as attendanceApi from "../api/attendance";
import type { AttendanceRecord } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { useAuth } from "../hooks/useAuth";

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

function formatDuration(clockIn: string, clockOut?: string | null): string {
  // A clock-out forgotten on an earlier day isn't "still running".
  if (!clockOut && !isToday(clockIn)) return "—";
  const end = clockOut ? new Date(clockOut) : new Date();
  const ms = end.getTime() - new Date(clockIn).getTime();
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

/** Clocked in more than 10 minutes after the staff member's shift start. */
function isLate(clockIn: string, shiftStart?: string) {
  if (!shiftStart) return false;
  const [h, m] = shiftStart.split(":").map(Number);
  const d = new Date(clockIn);
  return d.getHours() * 60 + d.getMinutes() > h * 60 + m + 10;
}

const fmtDay = (iso: string) => {
  const [y, mo, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export function AttendancePage() {
  const { user } = useAuth();
  const [own, setOwn] = useState<AttendanceRecord[]>([]);
  const [all, setAll] = useState<AttendanceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSeeAll = user && (user.role === "ADMIN" || user.role === "MANAGER");
  const [myLeaves, setMyLeaves] = useState<StaffLeave[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<StaffLeave[]>([]);

  async function load() {
    setError(null);
    try {
      const [ownRecords, allRecords] = await Promise.all([
        attendanceApi.listOwnAttendance(),
        canSeeAll ? attendanceApi.listAllAttendance() : Promise.resolve(null),
      ]);
      setOwn(ownRecords);
      setAll(allRecords);
      // Leave: my own requests, plus everyone's waiting requests for managers.
      const leaves = await staffApi.listLeaves(canSeeAll ? undefined : { userId: user?.id });
      setMyLeaves(leaves.filter((l) => l.userId === user?.id));
      setPendingLeaves(canSeeAll ? leaves.filter((l) => l.status === "PENDING") : []);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentlyIn = own.length > 0 && own[0].clockOut == null;

  async function handleClockIn() {
    setError(null);
    setBusy(true);
    try {
      await attendanceApi.clockIn();
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClockOut() {
    setError(null);
    setBusy(true);
    try {
      await attendanceApi.clockOut();
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Attendance</h1>
        {canSeeAll && (
          <Link
            to="/attendance/kiosk"
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Open clock-in kiosk
          </Link>
        )}
      </div>

      {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mb-6 flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <div>
          <div className="text-sm text-neutral-400">Current status</div>
          <div className={`text-lg font-semibold ${currentlyIn ? "text-red-400" : "text-neutral-200"}`}>
            {currentlyIn ? "● Clocked in" : "○ Clocked out"}
          </div>
          {currentlyIn && (
            <div className="text-xs text-neutral-500">Since {new Date(own[0].clockIn).toLocaleTimeString()}</div>
          )}
        </div>
        {currentlyIn ? (
          <button
            onClick={handleClockOut}
            disabled={busy}
            className="rounded-md bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Clock Out
          </button>
        ) : (
          <button
            onClick={handleClockIn}
            disabled={busy}
            className="rounded-md bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Clock In
          </button>
        )}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <LeaveRequestCard onDone={load} />
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase text-neutral-400">My leave</h2>
          {myLeaves.length === 0 ? (
            <div className="text-sm text-neutral-500">No leave requested yet.</div>
          ) : (
            <ul className="divide-y divide-neutral-800 text-sm">
              {myLeaves.slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-center justify-between py-1.5">
                  <span className="text-neutral-200">
                    {staffApi.LEAVE_LABEL[l.type]} · {fmtDay(l.startDate)}
                    {l.endDate.slice(0, 10) !== l.startDate.slice(0, 10) && ` – ${fmtDay(l.endDate)}`}{" "}
                    <span className="text-neutral-500">({l.days} day{l.days === 1 ? "" : "s"})</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className={l.status === "APPROVED" ? "text-green-400" : l.status === "REJECTED" ? "text-neutral-500" : "text-yellow-400"}>
                      {l.status === "PENDING" ? "Waiting" : l.status === "APPROVED" ? "Approved" : "Rejected"}
                    </span>
                    {l.status === "PENDING" && (
                      <button
                        onClick={async () => {
                          await staffApi.deleteLeave(l.id).catch((err) => setError(apiErrorMessage(err)));
                          load();
                        }}
                        className="text-neutral-500 hover:text-red-400"
                      >
                        Cancel
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {canSeeAll && pendingLeaves.length > 0 && (
        <div className="mb-6 rounded-lg border border-yellow-900 bg-yellow-950/20 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase text-yellow-400">Leave requests waiting ({pendingLeaves.length})</h2>
          <ul className="divide-y divide-neutral-800 text-sm">
            {pendingLeaves.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Link to={`/users/${l.userId}`} className="font-medium text-white hover:text-red-400">
                    {l.user?.name}
                  </Link>{" "}
                  <span className="text-neutral-300">
                    {staffApi.LEAVE_LABEL[l.type]} · {fmtDay(l.startDate)}
                    {l.endDate.slice(0, 10) !== l.startDate.slice(0, 10) && ` – ${fmtDay(l.endDate)}`} ({l.days} day{l.days === 1 ? "" : "s"})
                  </span>
                  {l.reason && <span className="block text-xs text-neutral-500">{l.reason}</span>}
                </span>
                <span className="flex gap-2 text-xs">
                  {(["APPROVED", "REJECTED"] as const).map((st) => (
                    <button
                      key={st}
                      onClick={async () => {
                        await staffApi.decideLeave(l.id, st).catch((err) => setError(apiErrorMessage(err)));
                        load();
                      }}
                      className={
                        st === "APPROVED"
                          ? "rounded-full bg-green-700 px-3 py-1 font-semibold text-white hover:bg-green-600"
                          : "rounded-full px-3 py-1 text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-800"
                      }
                    >
                      {st === "APPROVED" ? "Approve" : "Reject"}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase text-neutral-400">My History</h2>
      <div className="mb-8 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-black text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Clock In</th>
              <th className="px-4 py-2">Clock Out</th>
              <th className="px-4 py-2">Duration</th>
            </tr>
          </thead>
          <tbody>
            {own.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-500">
                  No attendance recorded yet.
                </td>
              </tr>
            ) : (
              own.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2 text-neutral-300">{new Date(r.clockIn).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-neutral-300">{new Date(r.clockIn).toLocaleTimeString()}</td>
                  <td className="px-4 py-2 text-neutral-300">
                    {r.clockOut ? new Date(r.clockOut).toLocaleTimeString() : (isToday(r.clockIn) ? <span className="text-red-400">In progress</span> : <span className="text-yellow-400">No clock-out</span>)}
                  </td>
                  <td className="px-4 py-2 text-neutral-300">{formatDuration(r.clockIn, r.clockOut)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canSeeAll && all && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase text-neutral-400">All Staff (recent)</h2>
            <Link to="/users" className="text-xs text-red-400 hover:underline">
              Staff management →
            </Link>
          </div>
          <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
            <table className="w-full text-sm">
              <thead className="bg-black text-left text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-4 py-2">Staff</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Clock In</th>
                  <th className="px-4 py-2">Clock Out</th>
                  <th className="px-4 py-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {all.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                      No attendance recorded yet.
                    </td>
                  </tr>
                ) : (
                  all.map((r) => (
                    <tr key={r.id} className="border-t border-neutral-800">
                      <td className="px-4 py-2 font-medium">
                        {r.user ? (
                          <Link to={`/users/${r.user.id}`} className="text-white hover:text-red-400">
                            {r.user.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2 text-neutral-300">{new Date(r.clockIn).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-neutral-300">
                        {new Date(r.clockIn).toLocaleTimeString()}
                        {isLate(r.clockIn, (r.user as { shiftStart?: string } | undefined)?.shiftStart) && (
                          <span className="ml-2 rounded-full bg-yellow-950 px-2 py-0.5 text-[10px] font-semibold text-yellow-300">Late</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-neutral-300">
                        {r.clockOut ? (
                          new Date(r.clockOut).toLocaleTimeString()
                        ) : (
                          isToday(r.clockIn) ? <span className="text-red-400">In progress</span> : <span className="text-yellow-400">No clock-out</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-neutral-300">{formatDuration(r.clockIn, r.clockOut)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** Any staff member asks for time off; a manager approves it. */
function LeaveRequestCard({ onDone }: { onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<LeaveType>("ANNUAL");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await staffApi.createLeave({ type, startDate: from, endDate: to, reason: reason || undefined });
      setMsg({ ok: true, text: "Request sent — a manager will approve it." });
      setReason("");
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    }
  }

  const cls = "mt-1 block w-full rounded-md border border-neutral-700 bg-black px-2 py-1.5 text-sm text-white";
  return (
    <form onSubmit={submit} className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="mb-2 text-sm font-semibold uppercase text-neutral-400">Request leave</h2>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-neutral-400">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as LeaveType)} className={cls}>
            {(Object.keys(staffApi.LEAVE_LABEL) as LeaveType[]).map((t) => (
              <option key={t} value={t}>
                {staffApi.LEAVE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-400">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cls} />
        </label>
        <label className="text-xs text-neutral-400">
          To
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={cls} />
        </label>
      </div>
      <label className="mt-2 block text-xs text-neutral-400">
        Reason (optional)
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={cls} />
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700">
          Send request
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
