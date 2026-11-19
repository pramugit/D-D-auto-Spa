import { useState, type FormEvent, type ReactNode } from "react";
import * as usersApi from "../api/users";
import type { StaffRole, StaffUser } from "../api/types";
import { apiErrorMessage } from "../api/client";
import { Modal } from "./Modal";

const ROLES: StaffRole[] = ["ADMIN", "MANAGER", "TECHNICIAN", "RECEPTIONIST"];
const inputCls =
  "w-full rounded-md border border-neutral-700 bg-black px-3 py-2 text-sm text-white focus:border-red-600 focus:outline-none";

function F({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-400">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-neutral-500">{hint}</span>}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-neutral-800 p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-red-500">{title}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/**
 * Add / edit a staff member — personal details, work (role, shift, salary),
 * bank details for payroll, and an emergency contact. Salary and bank fields
 * are only shown to admins (`showPay`).
 */
export function StaffFormModal({
  staff,
  showPay,
  onClose,
  onSaved,
}: {
  staff?: StaffUser;
  showPay: boolean;
  onClose: () => void;
  onSaved: (s: StaffUser) => void;
}) {
  const [f, setF] = useState({
    name: staff?.name ?? "",
    email: staff?.email ?? "",
    phone: staff?.phone ?? "",
    role: (staff?.role ?? "TECHNICIAN") as StaffRole,
    password: "",
    employeeCode: staff?.employeeCode ?? "",
    joinedAt: staff?.joinedAt ? staff.joinedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    nic: staff?.nic ?? "",
    address: staff?.address ?? "",
    emergencyName: staff?.emergencyName ?? "",
    emergencyPhone: staff?.emergencyPhone ?? "",
    bankName: staff?.bankName ?? "",
    bankAccount: staff?.bankAccount ?? "",
    shiftStart: staff?.shiftStart ?? "08:00",
    shiftEnd: staff?.shiftEnd ?? "18:00",
    monthlySalary: staff?.monthlySalary ? String(Number(staff.monthlySalary)) : "",
    epfNumber: staff?.epfNumber ?? "",
  });
  const [epfMember, setEpfMember] = useState(staff?.epfMember ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!staff && f.password.length < 8) {
      setError("Set a password of at least 8 characters");
      return;
    }
    if (f.shiftEnd <= f.shiftStart) {
      setError("Shift end must be after shift start");
      return;
    }
    setSaving(true);
    const details = {
      employeeCode: f.employeeCode.trim() || null,
      joinedAt: f.joinedAt || null,
      nic: f.nic || null,
      address: f.address || null,
      emergencyName: f.emergencyName || null,
      emergencyPhone: f.emergencyPhone || null,
      shiftStart: f.shiftStart,
      shiftEnd: f.shiftEnd,
      ...(showPay
        ? { bankName: f.bankName || null, bankAccount: f.bankAccount || null, epfMember, epfNumber: f.epfNumber || null }
        : {}),
    };
    try {
      const saved = staff
        ? await usersApi.updateUser(staff.id, {
            name: f.name,
            email: f.email,
            ...(f.phone ? { phone: f.phone } : {}),
            role: f.role,
            ...(f.password ? { password: f.password } : {}),
            ...(showPay ? { monthlySalary: f.monthlySalary === "" ? null : Number(f.monthlySalary) } : {}),
            ...details,
          })
        : await usersApi.createUser({
            name: f.name,
            email: f.email,
            ...(f.phone ? { phone: f.phone } : {}),
            role: f.role,
            password: f.password,
            ...(showPay && f.monthlySalary !== "" ? { monthlySalary: Number(f.monthlySalary) } : {}),
            ...details,
            employeeCode: details.employeeCode ?? undefined,
          } as Parameters<typeof usersApi.createUser>[0]);
      onSaved(saved);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={staff ? `Edit — ${staff.name}` : "Add staff member"} onClose={onClose} wide accent>
      <form onSubmit={submit} className="space-y-4">
        <Section title="Personal">
          <F label="Full name *">
            <input required value={f.name} onChange={set("name")} className={inputCls} />
          </F>
          <F label="NIC number">
            <input value={f.nic} onChange={set("nic")} className={inputCls} placeholder="200012345678" />
          </F>
          <F label="Phone">
            <input value={f.phone} onChange={set("phone")} className={inputCls} placeholder="07X XXX XXXX" />
          </F>
          <F label="Address">
            <input value={f.address} onChange={set("address")} className={inputCls} />
          </F>
        </Section>

        <Section title="Work">
          <F label="Role *">
            <select value={f.role} onChange={set("role")} className={inputCls}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0) + r.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </F>
          <F
            label="Employee code"
            hint={
              staff
                ? "4 digits — also their clock-in PIN at the Attendance kiosk"
                : "4 digits, also their clock-in PIN. Leave blank to pick a random free one"
            }
          >
            <input
              value={f.employeeCode}
              onChange={(e) => setF((p) => ({ ...p, employeeCode: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
              inputMode="numeric"
              pattern="\d{4}"
              title="Exactly 4 digits"
              className={inputCls}
              placeholder="e.g. 4821"
            />
          </F>
          <F label="Joined on">
            <input type="date" value={f.joinedAt} onChange={set("joinedAt")} className={inputCls} />
          </F>
          <div className="grid grid-cols-2 gap-2">
            <F label="Shift starts">
              <input type="time" value={f.shiftStart} onChange={set("shiftStart")} className={inputCls} />
            </F>
            <F label="Shift ends">
              <input type="time" value={f.shiftEnd} onChange={set("shiftEnd")} className={inputCls} />
            </F>
          </div>
        </Section>

        <Section title="Login">
          <F label="Email *">
            <input required type="email" value={f.email} onChange={set("email")} className={inputCls} />
          </F>
          <F label={staff ? "New password" : "Password *"} hint={staff ? "Leave blank to keep the current password" : "At least 8 characters"}>
            <input type="password" value={f.password} onChange={set("password")} className={inputCls} autoComplete="new-password" />
          </F>
        </Section>

        {showPay && (
          <Section title="Salary & bank">
            <F label="Monthly salary (Rs.)" hint="Blank = not on payroll">
              <input type="number" min={0} step="0.01" value={f.monthlySalary} onChange={set("monthlySalary")} className={inputCls} />
            </F>
            <F label="Bank">
              <input value={f.bankName} onChange={set("bankName")} className={inputCls} placeholder="e.g. Commercial Bank — Kosgama" />
            </F>
            <F label="Account number">
              <input value={f.bankAccount} onChange={set("bankAccount")} className={inputCls} />
            </F>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-neutral-200">
              <input type="checkbox" checked={epfMember} onChange={(e) => setEpfMember(e.target.checked)} className="accent-red-600" />
              EPF / ETF member
            </label>
            <F label="EPF member number" hint="As on the EPF registration">
              <input value={f.epfNumber} onChange={set("epfNumber")} disabled={!epfMember} className={`${inputCls} disabled:opacity-40`} />
            </F>
          </Section>
        )}

        <Section title="Emergency contact">
          <F label="Name">
            <input value={f.emergencyName} onChange={set("emergencyName")} className={inputCls} />
          </F>
          <F label="Phone">
            <input value={f.emergencyPhone} onChange={set("emergencyPhone")} className={inputCls} />
          </F>
        </Section>

        {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300 ring-1 ring-red-900">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-full bg-gradient-to-r from-red-600 to-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-600/30 transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          {saving ? "Saving..." : staff ? "Save changes" : "Add staff member"}
        </button>
      </form>
    </Modal>
  );
}
