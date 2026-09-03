import type { StaffRole } from "@prisma/client";

/**
 * ============================================================================
 * SINGLE PERMISSIONS MATRIX — Admin Portal and Manager Portal are the same
 * codebase, scoped by this config. There is no separate "Manager Portal".
 *
 * This object MUST stay byte-for-byte identical (in meaning — TS syntax
 * naturally differs) to frontend/src/config/permissions.ts's PERMISSIONS
 * export. There is no shared package between the two apps in this monorepo,
 * so a change here (or there) must be manually mirrored on the other side.
 * If you change one, change both, in the same commit.
 * ============================================================================
 *
 * A "section" is a coarse area of the app (a nav item / route group), not
 * every individual API endpoint. Endpoints that are shared utilities across
 * sections (e.g. "list services" needed by both the Service Catalog admin
 * page AND the booking-creation form) are NOT gated by this matrix — only
 * the section's own management actions are. Each such exception is called
 * out where it's implemented, in both frontend and backend.
 *
 * `edit` is always a subset of `view` — you can't edit what you can't see.
 */

export type PermissionSection =
  | "bookings"
  | "customersVehicles"
  | "jobBoard"
  | "serviceCatalog"
  | "invoicesPayments"
  | "inventory"
  | "opsDashboard"
  | "staff"
  | "siteGallery";

export interface SectionPermission {
  label: string;
  view: StaffRole[];
  edit: StaffRole[];
}

export const PERMISSIONS: Record<PermissionSection, SectionPermission> = {
  bookings: {
    label: "Bookings",
    view: ["ADMIN", "MANAGER", "RECEPTIONIST"],
    edit: ["ADMIN", "MANAGER", "RECEPTIONIST"],
  },
  customersVehicles: {
    label: "Customers & Vehicles",
    view: ["ADMIN", "MANAGER", "RECEPTIONIST"],
    edit: ["ADMIN", "MANAGER", "RECEPTIONIST"],
  },
  jobBoard: {
    label: "Job Board",
    view: ["ADMIN", "MANAGER", "TECHNICIAN", "RECEPTIONIST"],
    edit: ["ADMIN", "MANAGER", "TECHNICIAN"], // receptionist: read-only
  },
  serviceCatalog: {
    label: "Service Catalog",
    view: ["ADMIN", "MANAGER"],
    edit: ["ADMIN", "MANAGER"],
  },
  invoicesPayments: {
    label: "Invoices & Payments",
    view: ["ADMIN", "MANAGER", "RECEPTIONIST"],
    edit: ["ADMIN", "MANAGER", "RECEPTIONIST"],
  },
  inventory: {
    label: "Inventory",
    view: ["ADMIN", "MANAGER"],
    edit: ["ADMIN", "MANAGER"],
  },
  opsDashboard: {
    label: "Ops Dashboard",
    view: ["ADMIN", "MANAGER"],
    edit: ["ADMIN", "MANAGER"],
  },
  staff: {
    label: "Staff",
    view: ["ADMIN", "MANAGER"], // manager: read-only
    edit: ["ADMIN"],
  },
  siteGallery: {
    label: "Website Gallery",
    view: ["ADMIN"],
    edit: ["ADMIN"],
  },
};

export function canView(role: StaffRole, section: PermissionSection): boolean {
  return PERMISSIONS[section].view.includes(role);
}

export function canEdit(role: StaffRole, section: PermissionSection): boolean {
  return PERMISSIONS[section].edit.includes(role);
}
