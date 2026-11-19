import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BRAND } from "../config/brand";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { BackButton } from "./BackButton";

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.2 21 12 17.27 5.8 21 7 14.14l-5-4.87 7.1-1.01L12 2z" />
    </svg>
  );
}

export function PortalLayout() {
  const { customer, logout } = useCustomerAuth();
  const location = useLocation();
  const firstName = customer?.name?.split(" ")[0];

  return (
    <div className="font-display min-h-screen bg-black">
      <header className="no-print relative overflow-hidden border-b border-neutral-800 bg-gradient-to-r from-black via-red-950 to-black">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-blob absolute -left-10 -top-16 h-48 w-48 rounded-full bg-red-600/20 blur-3xl" />
          <div
            className="animate-blob absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-red-500/10 blur-3xl"
            style={{ animationDelay: "3s" }}
          />
        </div>
        <div className="relative mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <img src={BRAND.logo} alt={BRAND.name} className="h-10 w-auto" />
            <div className="text-xs text-neutral-400">
              {firstName ? `Welcome back, ${firstName}` : "Customer Portal"}
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <NavLink
              to="/portal/book"
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 font-medium transition ${
                  isActive ? "bg-red-600 text-white" : "text-neutral-300 hover:bg-neutral-900/10 hover:text-white"
                }`
              }
            >
              Book a Service
            </NavLink>
            <NavLink
              to="/portal/bookings"
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 font-medium transition ${
                  isActive ? "bg-red-600 text-white" : "text-neutral-300 hover:bg-neutral-900/10 hover:text-white"
                }`
              }
            >
              My Bookings
            </NavLink>
            <NavLink
              to="/portal/profile"
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 font-medium transition ${
                  isActive ? "bg-red-600 text-white" : "text-neutral-300 hover:bg-neutral-900/10 hover:text-white"
                }`
              }
            >
              My Profile
            </NavLink>
            <span className="relative ml-1 flex items-center gap-1 overflow-hidden rounded-full bg-red-500 px-2.5 py-1 text-xs font-semibold text-red-950">
              <span className="animate-shimmer pointer-events-none absolute inset-0 -skew-x-12 bg-neutral-900/40" />
              <StarIcon />
              {customer?.loyaltyPoints ?? 0} pts
            </span>
            <button onClick={logout} className="ml-1 text-neutral-400 transition hover:text-white">
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
