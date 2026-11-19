import axios from "axios";
import { apiClient } from "./client";
import type { InventoryItem } from "./types";
import { getInventoryUnlock, notifyInventoryLocked } from "./inventoryUnlock";

/** Every write needs the Inventory unlock token attached — see InventoryUnlockGate.tsx. */
function unlockHeaders() {
  const token = getInventoryUnlock();
  return token ? { "X-Inventory-Unlock": token } : {};
}

/** A 401 on a gated write means the unlock expired mid-session — drop it and let the gate re-prompt. */
async function withUnlockRecovery<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      notifyInventoryLocked();
    }
    throw err;
  }
}

export async function listInventoryItems(): Promise<InventoryItem[]> {
  const { data } = await apiClient.get<InventoryItem[]>("/inventory-items");
  return data;
}

export async function createInventoryItem(input: {
  name: string;
  unit: string;
  quantityInStock: number;
  reorderLevel: number;
  costPerUnit?: number;
}): Promise<InventoryItem> {
  return withUnlockRecovery(async () => {
    const { data } = await apiClient.post<InventoryItem>("/inventory-items", input, { headers: unlockHeaders() });
    return data;
  });
}

export async function updateInventoryItem(
  id: string,
  input: Partial<{ name: string; unit: string; quantityInStock: number; reorderLevel: number; costPerUnit: number }>
): Promise<InventoryItem> {
  return withUnlockRecovery(async () => {
    const { data } = await apiClient.patch<InventoryItem>(`/inventory-items/${id}`, input, { headers: unlockHeaders() });
    return data;
  });
}

export async function deleteInventoryItem(id: string): Promise<void> {
  return withUnlockRecovery(async () => {
    await apiClient.delete(`/inventory-items/${id}`, { headers: unlockHeaders() });
  });
}

// ── Automated inventory (Inventory page) ──
export type StockStatus = "OK" | "LOW" | "OUT" | "RECOUNT";

export interface InventoryOverviewItem extends InventoryItem {
  used30: number;
  daysLeft: number | null;
  status: StockStatus;
  suggestedOrder: number;
  stockValue: number;
}

export interface InventoryOverview {
  items: InventoryOverviewItem[];
  totals: { items: number; stockValue: number; low: number; out: number; usedCost30: number };
  servicesWithoutRecipe: string[];
}

export interface StockMovement {
  id: string;
  itemId: string;
  type: "RECEIVED" | "JOB_USAGE" | "ADJUSTMENT";
  quantity: string;
  balanceAfter: string;
  unitCost: string | null;
  note: string | null;
  createdAt: string;
  item: { name: string; unit: string };
  user: { name: string } | null;
  jobCard: { id: string; booking: { vehicle: { plateNumber: string } | null } } | null;
}

export interface ServiceRecipe {
  id: string;
  name: string;
  category: { name: string } | null;
  consumables: { itemId: string; quantity: string; item: { name: string; unit: string; costPerUnit: string } }[];
}

export type InventoryItemInput = {
  name: string;
  unit: string;
  quantityInStock: number;
  reorderLevel: number;
  costPerUnit?: number;
  category?: string | null;
  supplierName?: string | null;
  supplierPhone?: string | null;
  reorderQuantity?: number | null;
};

const gated = <T,>(fn: () => Promise<{ data: T }>) => withUnlockRecovery(async () => (await fn()).data);

export const getInventoryOverview = () =>
  gated(() => apiClient.get<InventoryOverview>("/inventory-items/overview", { headers: unlockHeaders() }));

export const listStockMovements = (itemId?: string, limit = 150) =>
  gated(() =>
    apiClient.get<StockMovement[]>("/inventory-items/movements", { params: { itemId, limit }, headers: unlockHeaders() })
  );

export const listServiceRecipes = () =>
  gated(() => apiClient.get<ServiceRecipe[]>("/inventory-items/recipes", { headers: unlockHeaders() }));

export const setServiceRecipe = (serviceId: string, items: { itemId: string; quantity: number }[]) =>
  gated(() =>
    apiClient.put<ServiceRecipe[]>(`/inventory-items/recipes/${serviceId}`, { items }, { headers: unlockHeaders() })
  );

export const receiveStock = (id: string, input: { quantity: number; unitCost?: number; note?: string }) =>
  gated(() => apiClient.post<InventoryItem>(`/inventory-items/${id}/receive`, input, { headers: unlockHeaders() }));

export const countStock = (id: string, input: { counted: number; note?: string }) =>
  gated(() => apiClient.post<InventoryItem>(`/inventory-items/${id}/count`, input, { headers: unlockHeaders() }));

export const installStarterKit = () =>
  gated(() =>
    apiClient.post<{ itemsAdded: number; recipesAdded: number }>("/inventory-items/starter-kit", {}, { headers: unlockHeaders() })
  );

export const createItem = (input: InventoryItemInput) =>
  gated(() => apiClient.post<InventoryItem>("/inventory-items", input, { headers: unlockHeaders() }));

export const updateItem = (id: string, input: Partial<Omit<InventoryItemInput, "quantityInStock">>) =>
  gated(() => apiClient.patch<InventoryItem>(`/inventory-items/${id}`, input, { headers: unlockHeaders() }));

// ── Import (CSV / Excel / PDF / photo) ──
export interface ScannedDocument {
  supplierName: string | null;
  supplierPhone: string | null;
  documentNote: string | null;
  items: { name: string; quantity: number; unit: string; unitCost: number | null; category: string | null }[];
}

export interface ImportRowInput {
  itemId?: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitCost?: number | null;
  category?: string | null;
  reorderLevel?: number | null;
  supplierName?: string | null;
  supplierPhone?: string | null;
}

/** PDF or photo → rows for review. Nothing is saved. */
export const scanStockDocument = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return gated(() =>
    apiClient.post<ScannedDocument>("/inventory-items/import/scan", form, {
      headers: { ...unlockHeaders(), "Content-Type": "multipart/form-data" },
      timeout: 180_000,
    })
  );
};

export const importInventory = (rows: ImportRowInput[], note?: string) =>
  gated(() =>
    apiClient.post<{ created: number; received: number }>("/inventory-items/import", { rows, note }, { headers: unlockHeaders() })
  );
