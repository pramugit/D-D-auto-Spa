// Storage for the short-lived "Inventory is unlocked" capability token
// (see backend's utils/inventoryUnlock.ts) — sessionStorage like the
// staff auth token (client.ts), so it's per-tab and cleared when the
// browser tab closes, not carried across devices/sessions.
const KEY = "autobody_inventory_unlock";

interface StoredUnlock {
  token: string;
  expiresAt: string;
}

export function getInventoryUnlock(): string | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredUnlock;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export function setInventoryUnlock(token: string, expiresAt: string) {
  sessionStorage.setItem(KEY, JSON.stringify({ token, expiresAt }));
}

export function clearInventoryUnlock() {
  sessionStorage.removeItem(KEY);
}

export function isInventoryUnlocked(): boolean {
  return getInventoryUnlock() !== null;
}

// A write can discover the unlock expired mid-session (a 401 from a
// gated inventory-items route) well after InventoryUnlockGate last
// checked sessionStorage — this lets it flip back to the lock screen
// immediately instead of just surfacing a confusing generic error.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onInventoryLocked(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function notifyInventoryLocked() {
  clearInventoryUnlock();
  listeners.forEach((cb) => cb());
}
