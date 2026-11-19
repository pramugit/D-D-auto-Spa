import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { apiClient } from "./client";
import type { WebAuthnCredentialInfo } from "./types";
import { setInventoryUnlock } from "./inventoryUnlock";

export { browserSupportsWebAuthn };

export async function listCredentials(): Promise<WebAuthnCredentialInfo[]> {
  const { data } = await apiClient.get<WebAuthnCredentialInfo[]>("/webauthn/credentials");
  return data;
}

export async function removeCredential(id: string): Promise<void> {
  await apiClient.delete(`/webauthn/credentials/${id}`);
}

/** Runs the full navigator.credentials.create() ceremony and registers the device. */
export async function registerDevice(deviceName: string): Promise<void> {
  const { data: options } = await apiClient.post("/webauthn/register/options");
  const response = await startRegistration({ optionsJSON: options });
  await apiClient.post("/webauthn/register/verify", { deviceName, response });
}

/**
 * Runs the full navigator.credentials.get() ceremony and, on success,
 * stores the resulting short-lived Inventory unlock token (see
 * api/inventoryUnlock.ts) so subsequent inventory-items writes carry it.
 */
export async function unlockWithDevice(): Promise<void> {
  const { data: options } = await apiClient.post("/webauthn/unlock/options");
  const response = await startAuthentication({ optionsJSON: options });
  const { data } = await apiClient.post<{ token: string; expiresAt: string }>("/webauthn/unlock/verify", { response });
  setInventoryUnlock(data.token, data.expiresAt);
}

export interface InventoryPinStatus {
  hasPin: boolean;
  /** Too many wrong PINs — only "Forgot PIN?" (password reset) works now. */
  blocked: boolean;
}

export async function getPinStatus(): Promise<InventoryPinStatus> {
  const { data } = await apiClient.get<InventoryPinStatus>("/webauthn/pin");
  return data;
}

export async function unlockWithPin(pin: string): Promise<void> {
  const { data } = await apiClient.post<{ token: string; expiresAt: string }>("/webauthn/unlock/pin", { pin });
  setInventoryUnlock(data.token, data.expiresAt);
}

/** Create, change, or reset a forgotten PIN (proved by the account password); also unlocks. */
export async function setPin(password: string, pin: string): Promise<void> {
  const { data } = await apiClient.post<{ token: string; expiresAt: string }>("/webauthn/pin", { password, pin });
  setInventoryUnlock(data.token, data.expiresAt);
}

export async function unlockWithPassword(password: string): Promise<void> {
  const { data } = await apiClient.post<{ token: string; expiresAt: string }>("/webauthn/unlock/password", { password });
  setInventoryUnlock(data.token, data.expiresAt);
}
