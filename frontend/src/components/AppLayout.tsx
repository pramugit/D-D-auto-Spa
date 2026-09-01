import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { StaffRole } from "../api/types";
import { PERMISSIONS, type PermissionSection } from "../config/permissions";

interface NavItem {
  to: string;
  label: string;
  section?: PermissionSection;
  // Only for the one nav item ("Reports") that isn't part of the
  // permissions matrix's 8 sections — an explicit admin-only exception,
  // same as its backend route.
  rolesOverride?: StaffRole[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/bookings", label: PERMISSIONS.bookings.label, section: "bookings" },
  { to: "/job-board", label: PERMISSIONS.jobBoard.label, section: "jobBoard" },
  { to: "/customers", label: PERMISSIONS.customersVehicles.label, section: "customersVehicles" },
  { to: "/catalog", label: PERMISSIONS.serviceCatalog.label, section: "serviceCatalog" },
  { to: "/invoices", label: PERMISSIONS.invoicesPayments.label, section: "invoicesPayments" },
  { to: "/inventory", label: PERMISSIONS.inventory.label, section: "inventory" },
  { to: "/reports", label: "Reports", rolesOverride: ["ADMIN"] },
  { to: "/ops-dashboard", label: PERMISSIONS.opsDashboard.label, section: "opsDashboard" },
  { to: "/users", label: PERMISSIONS.staff.label, section: "staff" },
];

function isVisible(item: NavItem, role: StaffRole): boolean {
  if (item.rolesOverride) return item.rolesOverride.includes(role);
  if (item.section) return PERMISSIONS[item.section].view.includes(role);
  return true;
}

export function AppLayout() {
  const { user, logout } = useAuth();

  const visibleItems = user ? NAV_ITEMS.filter((item) => isVisible(item, user.role)) : [];

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
