import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
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

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
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
              path="/users"
              element={
                <ProtectedRoute roles={["ADMIN"]}>
                  <UsersPage />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/bookings" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
