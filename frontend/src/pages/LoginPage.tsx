import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { apiErrorMessage } from "../api/client";

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const { logout: customerLogout } = useCustomerAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/job-board";
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/job-board", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="font-display flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="animate-fade-in-up w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-950 transition hover:text-sky-500"
        >
          &larr; Back
        </Link>
        <h1 className="mb-1 text-xl font-bold text-blue-950">
          Auto<span className="text-sky-500">Body</span> Service Station
        </h1>
        <p className="mb-6 text-sm text-slate-500">Staff sign in</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              placeholder="you@autobody.test"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              placeholder="••••••••"
            />
          </div>
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-sky-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <a
          href="/portal/login"
          onClick={(e) => {
            e.preventDefault();
            customerLogout();
            navigate("/portal/login");
          }}
          className="mt-4 block text-center text-sm text-slate-500 hover:underline"
        >
          Are you a customer? Go to the customer portal
        </a>
      </div>
    </div>
  );
}
