import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { BackButton } from "./BackButton";

export function PortalLayout() {
  const { customer, logout } = useCustomerAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-blue-900 bg-blue-950">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-lg font-semibold text-white">
              Auto<span className="text-sky-400">Body</span> Service Station
            </div>
            <div className="text-xs text-blue-300">Customer Portal</div>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <NavLink
              to="/portal/book"
              className={({ isActive }) =>
                isActive ? "font-semibold text-sky-400" : "text-blue-200 hover:text-white"
              }
            >
              Book a Service
            </NavLink>
            <NavLink
              to="/portal/bookings"
              className={({ isActive }) =>
                isActive ? "font-semibold text-sky-400" : "text-blue-200 hover:text-white"
              }
            >
              My Bookings
            </NavLink>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
              {customer?.loyaltyPoints ?? 0} pts
            </span>
            <button onClick={logout} className="text-blue-300 hover:text-white">
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div key={location.pathname} className="animate-fade-in-up">
          <BackButton />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
