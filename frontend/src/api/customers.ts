import { apiClient } from "./client";
import type { Customer, Vehicle, VehicleType } from "./types";

export async function listCustomers(search?: string): Promise<Customer[]> {
  const { data } = await apiClient.get<Customer[]>("/customers", { params: search ? { search } : undefined });
  return data;
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data } = await apiClient.get<Customer>(`/customers/${id}`);
  return data;
}

export async function createCustomer(input: {
  name: string;
  phone: string;
  email?: string;
  address?: string;
}): Promise<Customer> {
  const { data } = await apiClient.post<Customer>("/customers", input);
  return data;
}

export async function updateCustomer(
  id: string,
  input: Partial<{ name: string; phone: string; email: string; address: string }>
): Promise<Customer> {
  const { data } = await apiClient.patch<Customer>(`/customers/${id}`, input);
  return data;
}

export async function deleteCustomer(id: string): Promise<void> {
  await apiClient.delete(`/customers/${id}`);
}

export async function listVehicles(customerId: string): Promise<Vehicle[]> {
  const { data } = await apiClient.get<Vehicle[]>(`/customers/${customerId}/vehicles`);
  return data;
}

export async function createVehicle(
  customerId: string,
  input: { make: string; model: string; year: number; plateNumber: string; color?: string; vehicleType: VehicleType }
): Promise<Vehicle> {
  const { data } = await apiClient.post<Vehicle>(`/customers/${customerId}/vehicles`, input);
  return data;
}

export async function updateVehicle(
  customerId: string,
  vehicleId: string,
  input: Partial<{ make: string; model: string; year: number; plateNumber: string; color: string; vehicleType: VehicleType }>
): Promise<Vehicle> {
  const { data } = await apiClient.patch<Vehicle>(`/customers/${customerId}/vehicles/${vehicleId}`, input);
  return data;
}

export async function deleteVehicle(customerId: string, vehicleId: string): Promise<void> {
  await apiClient.delete(`/customers/${customerId}/vehicles/${vehicleId}`);
}

export async function getLoyalty(customerId: string): Promise<{ id: string; name: string; loyaltyPoints: number }> {
  const { data } = await apiClient.get(`/customers/${customerId}/loyalty`);
  return data;
}
