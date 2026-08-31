import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { StaffRole } from "../api/types";

interface NavItem {
  to: string;
  label: string;
  roles?: StaffRole[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/bookings", label: "Bookings" },
  { to: "/job-board", label: "Job Board" },
  { to: "/customers", label: "Customers" },
  { to: "/catalog", label: "Service Catalog", roles: ["ADMIN", "MANAGER"] },
  { to: "/invoices", label: "Invoices & Payments", roles: ["ADMIN", "MANAGER", "RECEPTIONIST"] },
  { to: "/inventory", label: "Inventory" },
  { to: "/users", label: "Staff", roles: ["ADMIN"] },
];

export function AppLayout() {
  const { user, logout } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="text-lg font-semibold text-slate-800">Autobody</div>
          <div className="text-xs text-slate-400">Service Station</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 truncate text-sm text-slate-600">{user?.name}</div>
          <div className="mb-3 text-xs text-slate-400">{user?.role}</div>
          <button
            onClick={logout}
            className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
