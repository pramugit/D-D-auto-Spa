import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useCustomerAuth } from "../hooks/useCustomerAuth";

export function PortalProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useCustomerAuth();
  if (!isAuthenticated) {
    return <Navigate to="/portal/login" replace />;
  }
  return <>{children}</>;
}
