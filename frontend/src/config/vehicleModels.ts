import type { VehicleType } from "../api/types";

// One rotatable 3D model per vehicle category (CC0 — Kenney's Car Kit for
// most, Quaternius' Public Transport Pack for the bus — see
// public/vehicle-models/CREDITS.txt). A few categories reuse the closest
// available shape rather than an exact match: JEEP uses the boxier
// suv-luxury model, CAB uses the pickup-style truck model, LORRY uses the
// box-truck "delivery" model, and SEVEN_SEATER reuses the VAN model since
// no free minivan/people-carrier model was found.
const VEHICLE_MODELS: Record<VehicleType, string> = {
  SEDAN: "/vehicle-models/SEDAN.glb",
  HATCHBACK: "/vehicle-models/HATCHBACK.glb",
  SUV: "/vehicle-models/SUV.glb",
  VAN: "/vehicle-models/VAN.glb",
  JEEP: "/vehicle-models/JEEP.glb",
  CAB: "/vehicle-models/CAB.glb",
  LORRY: "/vehicle-models/LORRY.glb",
  SEVEN_SEATER: "/vehicle-models/SEVEN_SEATER.glb",
  BUS: "/vehicle-models/BUS.glb",
  THREE_WHEELER: "/vehicle-models/THREE_WHEELER.glb",
  MOTORBIKE: "/vehicle-models/MOTORBIKE.glb",
};

export function getVehicleModel(vehicleType: VehicleType): string {
  return VEHICLE_MODELS[vehicleType] ?? VEHICLE_MODELS.SEDAN;
}
