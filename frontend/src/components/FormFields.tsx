import { useState } from "react";
import { formatName, formatPlateNumber, validateEmail, validateName, validatePhone, validatePlateNumber } from "../utils/validators";

interface FieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

const baseInputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

/** Trims/collapses/title-cases on blur (e.g. "  john   doe  " -> "John Doe"); rejects digits/most punctuation. */
export function NameField({ label, value, onChange, required, placeholder, className }: FieldProps) {
  const [touched, setTouched] = useState(false);
  const error = touched ? validateName(value) : null;

  return (
    <div className={className}>
      {label && <label className="mb-1 block text-sm font-medium text-slate-600">{label}</label>}
      <input
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          setTouched(true);
          if (value.trim()) onChange(formatName(value));
        }}
        className={`${baseInputClass} ${error ? "border-red-400" : ""}`}
      />
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
    </div>
  );
}

/** Digits, spaces, +, - only; minimum length enforced on blur. */
export function PhoneField({ label, value, onChange, required, placeholder, className }: FieldProps) {
  const [touched, setTouched] = useState(false);
  const error = touched ? validatePhone(value) : null;

  return (
    <div className={className}>
      {label && <label className="mb-1 block text-sm font-medium text-slate-600">{label}</label>}
      <input
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          // Reject disallowed characters at the input level, not just on submit/blur.
          const filtered = e.target.value.replace(/[^\d\s+-]/g, "");
          onChange(filtered);
        }}
        onBlur={() => setTouched(true)}
        className={`${baseInputClass} ${error ? "border-red-400" : ""}`}
      />
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
    </div>
  );
}

/** Standard email format, validated on blur. */
export function EmailField({ label, value, onChange, required, placeholder, className }: FieldProps) {
  const [touched, setTouched] = useState(false);
  const error = touched && value ? validateEmail(value) : null;

  return (
    <div className={className}>
      {label && <label className="mb-1 block text-sm font-medium text-slate-600">{label}</label>}
      <input
        type="email"
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        className={`${baseInputClass} ${error ? "border-red-400" : ""}`}
      />
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
    </div>
  );
}

/** Uppercase letters, digits, and dashes only; auto-uppercases as you type. */
export function PlateNumberField({ label, value, onChange, required, placeholder, className }: FieldProps) {
  const [touched, setTouched] = useState(false);
  const error = touched ? validatePlateNumber(value) : null;

  return (
    <div className={className}>
      {label && <label className="mb-1 block text-sm font-medium text-slate-600">{label}</label>}
      <input
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(formatPlateNumber(e.target.value))}
        onBlur={() => setTouched(true)}
        className={`${baseInputClass} uppercase ${error ? "border-red-400" : ""}`}
      />
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
    </div>
  );
}
