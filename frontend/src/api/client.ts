import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4001";

const TOKEN_KEY = "autobody_token";
const CUSTOMER_TOKEN_KEY = "autobody_customer_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getStoredCustomerToken(): string | null {
  return localStorage.getItem(CUSTOMER_TOKEN_KEY);
}

export function setStoredCustomerToken(token: string | null) {
  if (token) localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  else localStorage.removeItem(CUSTOMER_TOKEN_KEY);
}

// Staff dashboard client.
export const apiClient = axios.create({ baseURL: API_URL });
apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Customer portal client — kept separate (own token, own storage key) so
// a staff session and a customer session can coexist in the same browser.
export const customerApiClient = axios.create({ baseURL: API_URL });
customerApiClient.interceptors.request.use((config) => {
  const token = getStoredCustomerToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    return data?.error ?? err.message;
  }
  return err instanceof Error ? err.message : "Unexpected error";
}
