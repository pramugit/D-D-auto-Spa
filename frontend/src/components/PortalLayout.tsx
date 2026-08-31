import { NavLink, Outlet } from "react-router-dom";
import { useCustomerAuth } from "../hooks/useCustomerAuth";

export function PortalLayout() {
  const { customer, logout } = useCustomerAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-lg font-semibold text-slate-800">Autobody Service Station</div>
            <div className="text-xs text-slate-400">Customer Portal</div>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <NavLink
              to="/portal/book"
              className={({ isActive }) => (isActive ? "font-semibold text-slate-800" : "text-slate-500 hover:text-slate-700")}
            >
              Book a Service
            </NavLink>
            <NavLink
              to="/portal/bookings"
              className={({ isActive }) => (isActive ? "font-semibold text-slate-800" : "text-slate-500 hover:text-slate-700")}
            >
              My Bookings
            </NavLink>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
              {customer?.loyaltyPoints ?? 0} pts
            </span>
            <button onClick={logout} className="text-slate-400 hover:text-slate-600">
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
