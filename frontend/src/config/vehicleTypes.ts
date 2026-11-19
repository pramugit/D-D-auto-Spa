import type { VehicleType } from "../api/types";

/** Every vehicle type, in the order shown in dropdowns and price tables. */
export const VEHICLE_TYPES: VehicleType[] = [
  "SEDAN",
  "HATCHBACK",
  "SUV",
  "JEEP",
  "VAN",
  "SEVEN_SEATER",
  "CAB",
  "LORRY",
  "BUS",
  "THREE_WHEELER",
  "MOTORBIKE",
];

const LABELS: Record<VehicleType, string> = {
  SEDAN: "Car (sedan)",
  HATCHBACK: "Hatchback",
  SUV: "SUV",
  JEEP: "Jeep",
  VAN: "Van",
  SEVEN_SEATER: "7-seater",
  CAB: "Cab / pickup",
  LORRY: "Lorry",
  BUS: "Bus",
  THREE_WHEELER: "Three-wheeler",
  MOTORBIKE: "Motorbike",
};

export function vehicleTypeLabel(t: VehicleType | string | null | undefined): string {
  if (!t) return "";
  return LABELS[t as VehicleType] ?? String(t).replace(/_/g, " ");
}

/** "45,200 km" — or "" when no reading is recorded. */
export function formatMileage(km: number | null | undefined): string {
  return km == null ? "" : `${km.toLocaleString("en-US")} km`;
}
