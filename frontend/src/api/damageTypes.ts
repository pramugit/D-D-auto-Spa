import { apiClient } from "./client";
import type { DamageType, ServiceCategoryName } from "./types";

export async function listDamageTypes(): Promise<DamageType[]> {
  const { data } = await apiClient.get<DamageType[]>("/damage-types");
  return data;
}

export async function createDamageType(input: {
  name: string;
  defaultPrice: number;
  repairMinutes?: number;
  category: ServiceCategoryName;
}): Promise<DamageType> {
  const { data } = await apiClient.post<DamageType>("/damage-types", input);
  return data;
}

export async function updateDamageType(
  id: string,
  input: Partial<{ name: string; defaultPrice: number; repairMinutes: number; category: ServiceCategoryName }>
): Promise<DamageType> {
  const { data } = await apiClient.patch<DamageType>(`/damage-types/${id}`, input);
  return data;
}

export async function deleteDamageType(id: string): Promise<void> {
  await apiClient.delete(`/damage-types/${id}`);
}
