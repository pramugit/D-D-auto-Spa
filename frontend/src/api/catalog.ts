import { apiClient } from "./client";
import type { ServiceCategory, ServiceCategoryName, ServicePackage, Service, VehicleType, Bay, BayStatus } from "./types";

// ---- Categories ----

export async function listCategories(): Promise<ServiceCategory[]> {
  const { data } = await apiClient.get<ServiceCategory[]>("/service-categories");
  return data;
}

export async function createCategory(name: ServiceCategoryName): Promise<ServiceCategory> {
  const { data } = await apiClient.post<ServiceCategory>("/service-categories", { name });
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  await apiClient.delete(`/service-categories/${id}`);
}

// ---- Services ----

export interface ServicePricingInput {
  vehicleType: VehicleType;
  price: number;
}

export async function listServices(params?: { categoryId?: string; active?: boolean }): Promise<Service[]> {
  const { data } = await apiClient.get<Service[]>("/services", { params });
  return data;
}

export async function createService(input: {
  categoryId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  pricing: ServicePricingInput[];
}): Promise<Service> {
  const { data } = await apiClient.post<Service>("/services", input);
  return data;
}

export async function updateService(
  id: string,
  input: Partial<{
    categoryId: string;
    name: string;
    description: string;
    durationMinutes: number;
    active: boolean;
    pricing: ServicePricingInput[];
  }>
): Promise<Service> {
  const { data } = await apiClient.patch<Service>(`/services/${id}`, input);
  return data;
}

export async function deactivateService(id: string): Promise<void> {
  await apiClient.delete(`/services/${id}`);
}

// ---- Packages ----

export async function listPackages(): Promise<ServicePackage[]> {
  const { data } = await apiClient.get<ServicePackage[]>("/service-packages");
  return data;
}

export async function createPackage(input: {
  name: string;
  description?: string;
  discountedPrice: number;
  durationMinutes?: number | null;
  serviceIds: string[];
}): Promise<ServicePackage> {
  const { data } = await apiClient.post<ServicePackage>("/service-packages", input);
  return data;
}

export async function updatePackage(
  id: string,
  input: Partial<{ name: string; description: string; discountedPrice: number; durationMinutes: number | null; serviceIds: string[]; active: boolean }>
): Promise<ServicePackage> {
  const { data } = await apiClient.patch<ServicePackage>(`/service-packages/${id}`, input);
  return data;
}

export async function deactivatePackage(id: string): Promise<void> {
  await apiClient.delete(`/service-packages/${id}`);
}

// ---- Bays ----

export async function listBays(): Promise<Bay[]> {
  const { data } = await apiClient.get<Bay[]>("/bays");
  return data;
}

export async function createBay(name: string): Promise<Bay> {
  const { data } = await apiClient.post<Bay>("/bays", { name });
  return data;
}

export async function updateBay(id: string, status: BayStatus): Promise<Bay> {
  const { data } = await apiClient.patch<Bay>(`/bays/${id}`, { status });
  return data;
}

export async function deleteBay(id: string): Promise<void> {
  await apiClient.delete(`/bays/${id}`);
}
