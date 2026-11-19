import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { StaffRole } from "../api/types";
import { PERMISSIONS, type PermissionSection } from "../config/permissions";
import { BackButton } from "./BackButton";
import { BRAND } from "../config/brand";

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
  { to: "/customers", label: PERMISSIONS.customersVehicles.label, section: "customersVehicles" },
  { to: "/daily-jobs", label: "Daily Jobs", section: "jobBoard" },
  { to: "/bookings", label: PERMISSIONS.bookings.label, section: "bookings" },
  { to: "/job-board", label: PERMISSIONS.jobBoard.label, section: "jobBoard" },
  { to: "/job-notifications", label: PERMISSIONS.jobNotifications.label, section: "jobNotifications" },
  { to: "/invoices", label: PERMISSIONS.invoicesPayments.label, section: "invoicesPayments" },
  { to: "/catalog", label: PERMISSIONS.serviceCatalog.label, section: "serviceCatalog" },
  { to: "/inventory", label: PERMISSIONS.inventory.label, section: "inventory" },
  { to: "/ops-dashboard", label: PERMISSIONS.opsDashboard.label, section: "opsDashboard" },
  { to: "/reports", label: "Reports", rolesOverride: ["ADMIN"] },
  { to: "/users", label: PERMISSIONS.staff.label, section: "staff" },
  { to: "/attendance", label: PERMISSIONS.attendance.label, section: "attendance" },
  { to: "/payroll", label: PERMISSIONS.payroll.label, section: "payroll" },
  { to: "/site-gallery", label: PERMISSIONS.siteGallery.label, section: "siteGallery" },
];

function isVisible(item: NavItem, role: StaffRole): boolean {
  if (item.rolesOverride) return item.rolesOverride.includes(role);
  if (item.section) return PERMISSIONS[item.section].view.includes(role);
  return true;
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  const visibleItems = user ? NAV_ITEMS.filter((item) => isVisible(item, user.role)) : [];

  return (
    <div className="min-h-screen bg-black lg:flex">
      <div className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-neutral-800 bg-black px-4 py-3 lg:hidden">
        <img src={BRAND.logo} alt={BRAND.name} className="h-9 w-auto" />
        <button
          onClick={() => setNavOpen(true)}
          aria-label="Open menu"
          className="rounded-md border border-neutral-700 p-2 text-neutral-300 hover:bg-neutral-900 hover:text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {navOpen && (
        <div className="no-print fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setNavOpen(false)} />
      )}

      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] shrink-0 flex-col overflow-y-auto bg-black transition-transform duration-200 lg:static lg:z-auto lg:w-60 lg:max-w-none lg:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-4">
          <div className="min-w-0">
            <img src={BRAND.logo} alt={BRAND.name} className="h-auto w-full max-w-[200px]" />
            <div className="mt-1 text-[11px] text-neutral-500">{BRAND.tagline}</div>
          </div>
          <button
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
            className="rounded-md p-1 text-neutral-400 hover:text-white lg:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-red-600 text-white" : "text-neutral-300 hover:bg-red-950 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-neutral-800 p-3">
          <div className="mb-2 truncate text-sm text-neutral-200">{user?.name}</div>
          <div className="mb-3 text-xs text-neutral-400">{user?.role}</div>
          <button
            onClick={logout}
            className="w-full rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-red-950 hover:text-white"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        <div key={location.pathname} className="animate-fade-in-up">
          <BackButton />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
