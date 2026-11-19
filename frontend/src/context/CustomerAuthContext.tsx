import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";
import { getStoredCustomerToken, setStoredCustomerToken } from "../api/client";
import { loginCustomer, registerCustomer, type CustomerSummary } from "../api/portal";

const CUSTOMER_KEY = "autobody_portal_customer";

interface CustomerAuthContextValue {
  customer: CustomerSummary | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; phone: string; email: string; password: string; address?: string }) => Promise<void>;
  logout: () => void;
  refreshLoyalty: (points: number) => void;
  refreshProfile: (patch: Partial<Pick<CustomerSummary, "name" | "email">>) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const CustomerAuthContext = createContext<CustomerAuthContextValue | undefined>(undefined);

function loadStoredCustomer(): CustomerSummary | null {
  const raw = localStorage.getItem(CUSTOMER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CustomerSummary;
  } catch {
    return null;
  }
}

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredCustomerToken());
  const [customer, setCustomer] = useState<CustomerSummary | null>(loadStoredCustomer());

  function persist(result: { token: string; customer: CustomerSummary }) {
    setStoredCustomerToken(result.token);
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(result.customer));
    setToken(result.token);
    setCustomer(result.customer);
  }

  const login = useCallback(async (email: string, password: string) => {
    persist(await loginCustomer(email, password));
  }, []);

  const register = useCallback(
    async (input: { name: string; phone: string; email: string; password: string; address?: string }) => {
      persist(await registerCustomer(input));
    },
    []
  );

  const logout = useCallback(() => {
    setStoredCustomerToken(null);
    localStorage.removeItem(CUSTOMER_KEY);
    setToken(null);
    setCustomer(null);
  }, []);

  const refreshLoyalty = useCallback((points: number) => {
    setCustomer((prev) => {
      if (!prev) return prev;
      const next = { ...prev, loyaltyPoints: points };
      localStorage.setItem(CUSTOMER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const refreshProfile = useCallback((patch: Partial<Pick<CustomerSummary, "name" | "email">>) => {
    setCustomer((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem(CUSTOMER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      customer,
      isAuthenticated: !!token && !!customer,
      login,
      register,
      logout,
      refreshLoyalty,
      refreshProfile,
    }),
    [customer, token, login, register, logout, refreshLoyalty, refreshProfile]
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}
