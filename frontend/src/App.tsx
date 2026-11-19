import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { CustomerAuthProvider } from "./context/CustomerAuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PortalProtectedRoute } from "./components/PortalProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { PortalLayout } from "./components/PortalLayout";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { CustomersPage } from "./pages/CustomersPage";
import { CustomerDetailPage } from "./pages/CustomerDetailPage";
import { CatalogPage } from "./pages/CatalogPage";
import { BookingsPage } from "./pages/BookingsPage";
import { JobBoardPage } from "./pages/JobBoardPage";
import { DailyJobsPage } from "./pages/DailyJobsPage";
import { JobCardDetailPage } from "./pages/JobCardDetailPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { InventoryPage } from "./pages/InventoryPage";
import { UsersPage } from "./pages/UsersPage";
import { StaffProfilePage } from "./pages/StaffProfilePage";
import { ReportsPage } from "./pages/ReportsPage";
import { OpsDashboardPage } from "./pages/OpsDashboardPage";
import { JobNotificationsPage } from "./pages/JobNotificationsPage";
import { SiteGalleryPage } from "./pages/SiteGalleryPage";
import { AttendancePage } from "./pages/AttendancePage";
import { AttendanceKioskPage } from "./pages/AttendanceKioskPage";
import { InspectionApprovalPage } from "./pages/InspectionApprovalPage";
import { PayrollPage } from "./pages/PayrollPage";
import { PortalLoginPage } from "./pages/portal/PortalLoginPage";
import { PortalBookPage } from "./pages/portal/PortalBookPage";
import { PortalBookingsPage } from "./pages/portal/PortalBookingsPage";
import { PortalProfilePage } from "./pages/portal/PortalProfilePage";
import { PortalBookingDetailPage } from "./pages/portal/PortalBookingDetailPage";
import { PERMISSIONS } from "./config/permissions";

// Legacy path — every in-app link now points at /job-board/:id directly,
// this only catches anyone hitting an old /job-cards/:id URL (bookmark,
// browser history) and sends them to the canonical one, preserving the
// #damage-inspection-style hash Bookings' "View Job Card" link relies on.
function LegacyJobCardRedirect() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  return <Navigate to={`/job-board/${id}${location.hash}`} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CustomerAuthProvider>
          <Routes>
            {/* ---- Public marketing landing ---- */}
            <Route path="/" element={<LandingPage />} />

            {/* ---- Staff / admin dashboard ---- */}
            <Route path="/staff-portal/login" element={<LoginPage />} />
            {/* Customer's damage-inspection approval link — public, no login (token in the URL). */}
            <Route path="/inspection/:token" element={<InspectionApprovalPage />} />
            {/* Shared-device clock-in kiosk — deliberately outside AppLayout
                (no menu) so staff at the kiosk can't reach admin pages. */}
            <Route
              path="/attendance/kiosk"
              element={
                <ProtectedRoute roles={["ADMIN", "MANAGER"]}>
                  <AttendanceKioskPage />
                </ProtectedRoute>
              }
            />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route
                path="/bookings"
                element={
                  <ProtectedRoute roles={PERMISSIONS.bookings.view}>
                    <BookingsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/job-board" element={<JobBoardPage />} />
              {/* Canonical job-card hub route — every link in the app points
                  here now (Bookings, Job Board/Daily Jobs cards, Ops
                  Dashboard, Job Notifications). */}
              <Route path="/job-board/:id" element={<JobCardDetailPage />} />
              <Route path="/daily-jobs" element={<DailyJobsPage />} />
              {/* No separate job-cards list page — this path shows the exact
                  same Booking Job Board Kanban as /job-board (same
                  component), so a bare "/job-cards" visit lands on a working,
                  fully-featured page instead of falling through to the "*"
                  route (which would bounce a logged-in staff member out to
                  the public landing page). */}
              <Route path="/job-cards" element={<JobBoardPage />} />
              <Route path="/job-cards/:id" element={<LegacyJobCardRedirect />} />
              <Route
                path="/customers"
                element={
                  <ProtectedRoute roles={PERMISSIONS.customersVehicles.view}>
                    <CustomersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customers/:id"
                element={
                  <ProtectedRoute roles={PERMISSIONS.customersVehicles.view}>
                    <CustomerDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/catalog"
                element={
                  <ProtectedRoute roles={PERMISSIONS.serviceCatalog.view}>
                    <CatalogPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/invoices"
                element={
                  <ProtectedRoute roles={PERMISSIONS.invoicesPayments.view}>
                    <InvoicesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/invoices/:id"
                element={
                  <ProtectedRoute roles={PERMISSIONS.invoicesPayments.view}>
                    <InvoicesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory"
                element={
                  <ProtectedRoute roles={PERMISSIONS.inventory.view}>
                    <InventoryPage />
                  </ProtectedRoute>
                }
              />
              {/* Reports isn't one of the permissions matrix's 8 sections
                  — an explicit admin-only page, same as its backend routes. */}
              <Route
                path="/reports"
                element={
                  <ProtectedRoute roles={["ADMIN"]}>
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute roles={PERMISSIONS.staff.view}>
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users/:id"
                element={
                  <ProtectedRoute roles={PERMISSIONS.staff.view}>
                    <StaffProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/ops-dashboard"
                element={
                  <ProtectedRoute roles={PERMISSIONS.opsDashboard.view}>
                    <OpsDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/job-notifications"
                element={
                  <ProtectedRoute roles={PERMISSIONS.jobNotifications.view}>
                    <JobNotificationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/site-gallery"
                element={
                  <ProtectedRoute roles={PERMISSIONS.siteGallery.view}>
                    <SiteGalleryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/attendance"
                element={
                  <ProtectedRoute roles={PERMISSIONS.attendance.view}>
                    <AttendancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/payroll"
                element={
                  <ProtectedRoute roles={PERMISSIONS.payroll.view}>
                    <PayrollPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* ---- Customer portal ---- */}
            <Route path="/portal/login" element={<PortalLoginPage />} />
            <Route
              element={
                <PortalProtectedRoute>
                  <PortalLayout />
                </PortalProtectedRoute>
              }
            >
              <Route path="/portal" element={<Navigate to="/portal/bookings" replace />} />
              <Route path="/portal/book" element={<PortalBookPage />} />
              <Route path="/portal/bookings" element={<PortalBookingsPage />} />
              <Route path="/portal/bookings/:id" element={<PortalBookingDetailPage />} />
              <Route path="/portal/profile" element={<PortalProfilePage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CustomerAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
