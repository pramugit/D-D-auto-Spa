import { apiClient } from "./client";
import type { InventoryItem } from "./types";

export async function listInventoryItems(): Promise<InventoryItem[]> {
  const { data } = await apiClient.get<InventoryItem[]>("/inventory-items");
  return data;
}

export async function createInventoryItem(input: {
  name: string;
  unit: string;
  quantityInStock: number;
  reorderLevel: number;
}): Promise<InventoryItem> {
  const { data } = await apiClient.post<InventoryItem>("/inventory-items", input);
  return data;
}

export async function updateInventoryItem(
  id: string,
  input: Partial<{ name: string; unit: string; quantityInStock: number; reorderLevel: number }>
): Promise<InventoryItem> {
  const { data } = await apiClient.patch<InventoryItem>(`/inventory-items/${id}`, input);
  return data;
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await apiClient.delete(`/inventory-items/${id}`);
}
