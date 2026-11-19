import { useState, type FormEvent } from "react";
import { BRAND } from "../../config/brand";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useCustomerAuth } from "../../hooks/useCustomerAuth";
import { apiErrorMessage } from "../../api/client";
import { EmailField, NameField, PhoneField } from "../../components/FormFields";

export function PortalLoginPage() {
  const { login, register, isAuthenticated } = useCustomerAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/portal/bookings" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register({ name, phone, email, password });
      }
      navigate("/portal/bookings", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="font-display flex min-h-screen items-center justify-center bg-black px-4">
      <div className="animate-fade-in-up w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-sm">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-white transition hover:text-red-500"
        >
          &larr; Back
        </Link>
        <h1 className="mb-2">
          <img src={BRAND.logo} alt={BRAND.name} className="h-auto w-full max-w-[280px]" />
        </h1>
        <p className="mb-6 text-sm text-neutral-400">
          {mode === "login" ? "Sign in to your account" : "Create your account"}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <>
              <NameField label="Name" required value={name} onChange={setName} />
              <PhoneField label="Phone" required value={phone} onChange={setPhone} />
            </>
          )}
          <EmailField label="Email" required value={email} onChange={setEmail} />
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm"
            />
          </div>
          {error && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          className="mt-4 w-full text-center text-sm text-neutral-400 hover:underline"
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
