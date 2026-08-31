import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { CustomerAuthProvider } from "./context/CustomerAuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PortalProtectedRoute } from "./components/PortalProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { PortalLayout } from "./components/PortalLayout";
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
import { PortalLoginPage } from "./pages/portal/PortalLoginPage";
import { PortalBookPage } from "./pages/portal/PortalBookPage";
import { PortalBookingsPage } from "./pages/portal/PortalBookingsPage";
import { PortalBookingDetailPage } from "./pages/portal/PortalBookingDetailPage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CustomerAuthProvider>
          <Routes>
            {/* ---- Staff / admin dashboard ---- */}
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Navigate to="/bookings" replace />} />
              <Route path="/bookings" element={<BookingsPage />} />
              <Route path="/job-board" element={<JobBoardPage />} />
              <Route path="/job-cards/:id" element={<JobCardDetailPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route
                path="/catalog"
                element={
                  <ProtectedRoute roles={["ADMIN", "MANAGER"]}>
                    <CatalogPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/invoices"
                element={
                  <ProtectedRoute roles={["ADMIN", "MANAGER", "RECEPTIONIST"]}>
                    <InvoicesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/invoices/:id"
                element={
                  <ProtectedRoute roles={["ADMIN", "MANAGER", "RECEPTIONIST"]}>
                    <InvoicesPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/inventory" element={<InventoryPage />} />
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
                  <ProtectedRoute roles={["ADMIN"]}>
                    <UsersPage />
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

            <Route path="*" element={<Navigate to="/bookings" replace />} />
          </Routes>
        </CustomerAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
