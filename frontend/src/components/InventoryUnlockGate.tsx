import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import * as webauthnApi from "../api/webauthn";
import { clearInventoryUnlock, isInventoryUnlocked, onInventoryLocked } from "../api/inventoryUnlock";
import { apiErrorMessage } from "../api/client";
import type { WebAuthnCredentialInfo } from "../api/types";
import { Modal } from "./Modal";

/**
 * Gates its children behind the Inventory unlock (4-digit PIN, or fingerprint/passkey;
 * "Forgot PIN?" resets it with the account password) — see backend's middleware/inventoryUnlock.ts
 * for the API-side half of this. The unlock is a capability token good
 * for 30 minutes (api/inventoryUnlock.ts), not a login — closing the tab
 * or letting it expire means proving again next time.
 */
export function InventoryUnlockGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(isInventoryUnlocked());
  const [showDevices, setShowDevices] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);

  useEffect(() => onInventoryLocked(() => setUnlocked(false)), []);

  if (!unlocked) {
    return (
      <>
        <UnlockScreen onUnlocked={() => setUnlocked(true)} onManageDevices={() => setShowDevices(true)} />
        {showDevices && <DeviceManagerModal onClose={() => setShowDevices(false)} />}
      </>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-md border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-400">
        <span>🔓 Inventory unlocked for this session (re-locks automatically after 30 minutes of inactivity)</span>
        <div className="flex gap-3">
          <button onClick={() => setShowChangePin(true)} className="font-medium underline hover:no-underline">
            Change PIN
          </button>
          <button onClick={() => setShowDevices(true)} className="font-medium underline hover:no-underline">
            Manage devices
          </button>
          <button
            onClick={() => {
              clearInventoryUnlock();
              setUnlocked(false);
            }}
            className="font-medium underline hover:no-underline"
          >
            Lock now
          </button>
        </div>
      </div>
      {children}
      {showDevices && <DeviceManagerModal onClose={() => setShowDevices(false)} />}
      {showChangePin && (
        <Modal title="Change Inventory PIN" onClose={() => setShowChangePin(false)}>
          <div className="flex justify-center">
            <SetPinForm
              title="Change PIN"
              subtitle="Confirm with your account password, then choose a new 4-digit PIN."
              submitLabel="Save new PIN"
              onDone={() => setShowChangePin(false)}
              onCancel={() => setShowChangePin(false)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

const PIN_LENGTH = 4;

function LockIcon() {
  return (
    <svg className="mb-3 h-10 w-10 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M7 10V7a5 5 0 0 1 10 0v3" strokeLinecap="round" />
    </svg>
  );
}

type Mode = "loading" | "pin" | "setup" | "forgot";

function UnlockScreen({ onUnlocked, onManageDevices }: { onUnlocked: () => void; onManageDevices: () => void }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const deviceSupported = webauthnApi.browserSupportsWebAuthn();

  useEffect(() => {
    webauthnApi
      .getPinStatus()
      .then((s) => {
        setBlocked(s.blocked);
        setMode(s.hasPin ? "pin" : "setup");
      })
      .catch((err) => {
        setError(apiErrorMessage(err));
        setMode("pin");
      });
  }, []);

  async function handleDeviceUnlock() {
    setError(null);
    setDeviceBusy(true);
    try {
      await webauthnApi.unlockWithDevice();
      onUnlocked();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setDeviceBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 px-6 py-14 text-center">
      <LockIcon />
      {mode === "loading" && <p className="text-sm text-neutral-400">Loading…</p>}

      {mode === "pin" && (
        <PinPad
          blocked={blocked}
          onBlocked={() => setBlocked(true)}
          onUnlocked={onUnlocked}
          onForgot={() => {
            setError(null);
            setMode("forgot");
          }}
        />
      )}

      {(mode === "setup" || mode === "forgot") && (
        <SetPinForm
          title={mode === "setup" ? "Create your Inventory PIN" : "Reset your PIN"}
          subtitle={
            mode === "setup"
              ? "Choose a 4-digit PIN to lock Inventory. Confirm it's you with your account password."
              : "Forgot your PIN? Enter your account password and choose a new 4-digit PIN."
          }
          submitLabel={mode === "setup" ? "Create PIN & unlock" : "Reset PIN & unlock"}
          onDone={onUnlocked}
          onCancel={mode === "forgot" ? () => setMode("pin") : undefined}
        />
      )}

      {error && <div className="mt-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}

      {mode !== "loading" && deviceSupported && (
        <div className="mt-8 flex flex-col items-center gap-1 text-xs text-neutral-500">
          <button onClick={handleDeviceUnlock} disabled={deviceBusy} className="underline hover:text-neutral-300 hover:no-underline">
            {deviceBusy ? "Waiting for device…" : "Unlock with fingerprint / Face ID instead"}
          </button>
          <button onClick={onManageDevices} className="underline hover:text-neutral-300 hover:no-underline">
            Manage devices
          </button>
        </div>
      )}
    </div>
  );
}

/** Four dots + a phone-style keypad; also accepts the physical keyboard. Auto-submits at 4 digits. */
function PinPad({
  blocked,
  onBlocked,
  onUnlocked,
  onForgot,
}: {
  blocked: boolean;
  onBlocked: () => void;
  onUnlocked: () => void;
  onForgot: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  async function submit(value: string) {
    setBusy(true);
    setError(null);
    try {
      await webauthnApi.unlockWithPin(value);
      onUnlocked();
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const msg = apiErrorMessage(err);
      setError(msg);
      if (status === 423 || /too many/i.test(msg)) onBlocked();
      setShake(true);
      setTimeout(() => setShake(false), 400);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  function press(digit: string) {
    if (busy || blocked || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    setError(null);
    if (next.length === PIN_LENGTH) submit(next);
  }

  function backspace() {
    if (!busy) setPin((p) => p.slice(0, -1));
  }

  // Physical keyboard support (desktop).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") backspace();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const keyClass =
    "flex h-16 w-16 items-center justify-center rounded-full border border-neutral-700 bg-neutral-950 text-2xl font-medium text-white transition hover:bg-neutral-800 active:scale-95 disabled:opacity-40";

  return (
    <div className="flex flex-col items-center">
      <h1 className="mb-1 text-xl font-semibold text-white">Inventory is locked</h1>
      <p className="mb-6 text-sm text-neutral-400">
        {blocked ? "PIN unlock is blocked after too many wrong attempts." : "Enter your 4-digit PIN"}
      </p>

      <div className={`mb-6 flex gap-4 ${shake ? "animate-[pinshake_0.4s]" : ""}`} aria-label={`${pin.length} of 4 digits entered`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 ${
              error ? "border-red-600" : "border-neutral-400"
            } ${i < pin.length ? (error ? "bg-red-600" : "bg-white") : ""}`}
          />
        ))}
      </div>
      <style>{"@keyframes pinshake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}"}</style>

      <div className="grid grid-cols-3 gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} disabled={busy || blocked} className={keyClass}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => press("0")} disabled={busy || blocked} className={keyClass}>
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={busy || blocked || pin.length === 0}
          aria-label="Delete last digit"
          className="flex h-16 w-16 items-center justify-center rounded-full text-neutral-400 hover:text-white disabled:opacity-30"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" strokeLinejoin="round" />
            <path d="m12 9 6 6m0-6-6 6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="mt-4 h-5 text-sm text-red-500">{busy ? <span className="text-neutral-400">Checking…</span> : error}</div>

      <button onClick={onForgot} className="mt-3 text-sm font-medium text-red-500 underline hover:no-underline">
        Forgot PIN?
      </button>
    </div>
  );
}

/** Create / change / reset a PIN — the account password is the proof. Unlocks on success. */
function SetPinForm({
  title,
  subtitle,
  submitLabel,
  onDone,
  onCancel,
}: {
  title: string;
  subtitle: string;
  submitLabel: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return setError("PIN must be exactly 4 digits");
    if (pin !== confirm) return setError("PINs don't match");
    setError(null);
    setBusy(true);
    try {
      await webauthnApi.setPin(password, pin);
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const pinInput = "w-full rounded-md border border-neutral-700 px-3 py-2 text-center text-lg tracking-[0.6em]";
  const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, PIN_LENGTH);

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      <p className="text-sm text-neutral-400">{subtitle}</p>
      <input
        type="password"
        autoFocus
        required
        autoComplete="current-password"
        placeholder="Your account password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
      />
      <input
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        required
        placeholder="New PIN"
        value={pin}
        onChange={(e) => setPin(digitsOnly(e.target.value))}
        className={pinInput}
      />
      <input
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        required
        placeholder="Confirm PIN"
        value={confirm}
        onChange={(e) => setConfirm(digitsOnly(e.target.value))}
        className={pinInput}
      />
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
      >
        {busy ? "Saving…" : submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="w-full text-sm text-neutral-400 underline hover:no-underline">
          Back to PIN
        </button>
      )}
      {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-500">{error}</div>}
    </form>
  );
}

function DeviceManagerModal({ onClose }: { onClose: () => void }) {
  const [devices, setDevices] = useState<WebAuthnCredentialInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [registering, setRegistering] = useState(false);
  const deviceSupported = webauthnApi.browserSupportsWebAuthn();

  async function load() {
    setError(null);
    try {
      setDevices(await webauthnApi.listCredentials());
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setRegistering(true);
    try {
      await webauthnApi.registerDevice(deviceName.trim());
      setDeviceName("");
      setNotice("Device registered — you can unlock Inventory with it now.");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setRegistering(false);
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await webauthnApi.removeCredential(id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <Modal title="Inventory Unlock Devices" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-neutral-400">
          Each registered device's fingerprint/Face ID/passkey can unlock Inventory. Register your phone, laptop, or a
          security key — any one of them works.
        </p>

        {deviceSupported ? (
          <form onSubmit={handleRegister} className="flex gap-2">
            <input
              required
              placeholder="Device name, e.g. My iPhone"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="flex-1 rounded-md border border-neutral-700 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={registering}
              className="shrink-0 rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {registering ? "Registering…" : "+ Register this device"}
            </button>
          </form>
        ) : (
          <div className="rounded-md bg-red-950 px-3 py-2 text-xs text-red-300">
            This browser doesn't support device unlock — you can still use your password to unlock Inventory.
          </div>
        )}

        {notice && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-400">{notice}</div>}
        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}

        <ul className="divide-y divide-neutral-800 rounded-md border border-neutral-800">
          {devices.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-neutral-500">No devices registered yet.</li>
          ) : (
            devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <div className="font-medium text-neutral-200">{d.deviceName}</div>
                  <div className="text-xs text-neutral-500">
                    Registered {new Date(d.createdAt).toLocaleDateString()}
                    {d.lastUsedAt && ` · last used ${new Date(d.lastUsedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <button onClick={() => handleRemove(d.id)} className="text-xs text-red-500 underline hover:no-underline">
                  Remove
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Modal>
  );
}
