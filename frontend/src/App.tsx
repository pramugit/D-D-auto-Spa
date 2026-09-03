import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
import { JobCardDetailPage } from "./pages/JobCardDetailPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { InventoryPage } from "./pages/InventoryPage";
import { UsersPage } from "./pages/UsersPage";
import { ReportsPage } from "./pages/ReportsPage";
import { OpsDashboardPage } from "./pages/OpsDashboardPage";
import { SiteGalleryPage } from "./pages/SiteGalleryPage";
import { PortalLoginPage } from "./pages/portal/PortalLoginPage";
import { PortalBookPage } from "./pages/portal/PortalBookPage";
import { PortalBookingsPage } from "./pages/portal/PortalBookingsPage";
import { PortalBookingDetailPage } from "./pages/portal/PortalBookingDetailPage";
import { PERMISSIONS } from "./config/permissions";

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
              <Route path="/job-cards/:id" element={<JobCardDetailPage />} />
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
                path="/ops-dashboard"
                element={
                  <ProtectedRoute roles={PERMISSIONS.opsDashboard.view}>
                    <OpsDashboardPage />
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
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CustomerAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
