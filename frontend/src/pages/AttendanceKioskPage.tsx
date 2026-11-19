import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import * as attendanceApi from "../api/attendance";
import type { KioskPunchResult } from "../api/attendance";
import { apiErrorMessage } from "../api/client";

const CODE_LENGTH = 4;
const RESULT_SECONDS = 5;

/**
 * Full-screen clock-in kiosk for a shared device at the shop. A manager
 * logs in and opens it; staff walk up, type their 4-digit employee code
 * (shown on their Staff page) and tap Clock In / Clock Out. It sits
 * outside the app layout on purpose — no menu, so nobody at the kiosk
 * can wander into the manager's admin pages. Exiting asks for the
 * manager's password.
 */
export function AttendanceKioskPage() {
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KioskPunchResult | null>(null);
  const [showExit, setShowExit] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  function reset() {
    window.clearTimeout(resetTimer.current);
    setResult(null);
    setError(null);
    setCode("");
  }

  async function punch(action: "in" | "out") {
    if (code.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await attendanceApi.kioskPunch(code, action);
      setResult(r);
      setCode("");
      resetTimer.current = window.setTimeout(reset, RESULT_SECONDS * 1000);
    } catch (err) {
      setError(apiErrorMessage(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  function press(d: string) {
    if (busy || result) return;
    setError(null);
    setCode((c) => (c.length < CODE_LENGTH ? c + d : c));
  }

  // Physical keyboard / USB keypad: digits, Backspace, I = in, O = out, Esc = clear.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showExit) return;
      if (result) {
        reset();
        return;
      }
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setCode((c) => c.slice(0, -1));
      else if (e.key === "Escape") reset();
      else if (e.key.toLowerCase() === "i") punch("in");
      else if (e.key.toLowerCase() === "o") punch("out");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ready = code.length === CODE_LENGTH && !busy;
  const key =
    "flex h-20 w-20 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-3xl font-medium text-white transition hover:bg-neutral-800 active:scale-95 disabled:opacity-40 sm:h-24 sm:w-24";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-black px-4 py-10 text-white">
      <button
        onClick={() => setShowExit(true)}
        className="absolute right-4 top-4 rounded-md px-3 py-1.5 text-xs text-neutral-600 ring-1 ring-neutral-800 hover:text-neutral-300"
      >
        Exit kiosk
      </button>

      <div className="mb-8 text-center">
        <div className="text-5xl font-semibold tabular-nums sm:text-6xl">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
        <div className="mt-1 text-neutral-400">
          {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      {result ? (
        <button onClick={reset} className="flex w-full max-w-md flex-col items-center rounded-2xl border border-neutral-800 bg-neutral-950 px-6 py-12 text-center">
          <div
            className={`mb-4 flex h-20 w-20 items-center justify-center rounded-full text-4xl ${
              result.action === "in" ? "bg-green-700" : "bg-red-700"
            }`}
          >
            ✓
          </div>
          <div className="text-2xl font-semibold">
            {result.action === "in" ? "Welcome" : "Goodbye"}, {result.name}
          </div>
          <div className="mt-2 text-lg text-neutral-300">
            Clocked {result.action} at{" "}
            {new Date(result.action === "in" ? result.record.clockIn : (result.record.clockOut ?? result.record.clockIn)).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          <div className="mt-6 text-xs text-neutral-500">Tap to continue</div>
        </button>
      ) : (
        <div className="flex flex-col items-center">
          <div className="mb-2 text-lg text-neutral-300">Enter your 4-digit employee code</div>
          <div className="mb-6 flex gap-5">
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <span
                key={i}
                className={`h-5 w-5 rounded-full border-2 ${error ? "border-red-600" : "border-neutral-400"} ${
                  i < code.length ? (error ? "bg-red-600" : "bg-white") : ""
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} type="button" onClick={() => press(d)} disabled={busy} className={key}>
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={reset}
              disabled={busy || code.length === 0}
              className="flex h-20 w-20 items-center justify-center rounded-full text-sm text-neutral-400 hover:text-white disabled:opacity-30 sm:h-24 sm:w-24"
            >
              Clear
            </button>
            <button type="button" onClick={() => press("0")} disabled={busy} className={key}>
              0
            </button>
            <button
              type="button"
              onClick={() => setCode((c) => c.slice(0, -1))}
              disabled={busy || code.length === 0}
              aria-label="Delete last digit"
              className="flex h-20 w-20 items-center justify-center rounded-full text-neutral-400 hover:text-white disabled:opacity-30 sm:h-24 sm:w-24"
            >
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" strokeLinejoin="round" />
                <path d="m12 9 6 6m0-6-6 6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="mt-5 min-h-6 text-center text-sm text-red-500">{busy ? <span className="text-neutral-400">Saving…</span> : error}</div>

          <div className="mt-4 grid w-full max-w-sm grid-cols-2 gap-3">
            <button
              onClick={() => punch("in")}
              disabled={!ready}
              className="rounded-xl bg-green-700 py-4 text-lg font-semibold text-white hover:bg-green-600 disabled:opacity-40"
            >
              Clock In
            </button>
            <button
              onClick={() => punch("out")}
              disabled={!ready}
              className="rounded-xl bg-red-700 py-4 text-lg font-semibold text-white hover:bg-red-600 disabled:opacity-40"
            >
              Clock Out
            </button>
          </div>
        </div>
      )}

      {showExit && <ExitDialog onCancel={() => setShowExit(false)} onExit={() => navigate("/attendance")} />}
    </div>
  );
}

function ExitDialog({ onCancel, onExit }: { onCancel: () => void; onExit: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await attendanceApi.kioskVerifyExit(password);
      onExit();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
      <form onSubmit={submit} className="w-full max-w-xs space-y-3 rounded-xl border border-neutral-800 bg-neutral-950 p-5">
        <h2 className="text-lg font-semibold">Exit kiosk mode</h2>
        <p className="text-xs text-neutral-400">Enter the password of the manager account logged in on this device.</p>
        <input
          type="password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm"
        />
        {error && <div className="text-sm text-red-500">{error}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-md py-2 text-sm text-neutral-300 ring-1 ring-neutral-700">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="flex-1 rounded-md bg-red-700 py-2 text-sm font-medium hover:bg-red-600 disabled:opacity-50">
            {busy ? "Checking…" : "Exit"}
          </button>
        </div>
      </form>
    </div>
  );
}
