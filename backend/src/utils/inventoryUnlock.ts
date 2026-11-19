import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

// Deliberately short — this is a capability token for "the Inventory
// section is unlocked right now," not a session. Re-proving with the
// fingerprint/passkey (or password fallback) every half hour is the
// point, not a bug.
const UNLOCK_TTL_SECONDS = 30 * 60;

export interface InventoryUnlockPayload {
  type: "inventory-unlock";
  sub: string;
}

export function signInventoryUnlock(userId: string): { token: string; expiresAt: string } {
  const token = jwt.sign({ type: "inventory-unlock", sub: userId }, JWT_SECRET as string, {
    expiresIn: UNLOCK_TTL_SECONDS,
  });
  const expiresAt = new Date(Date.now() + UNLOCK_TTL_SECONDS * 1000).toISOString();
  return { token, expiresAt };
}

/** Throws if missing, expired, malformed, or issued for a different user. */
export function verifyInventoryUnlock(token: string, expectedUserId: string): void {
  let payload: InventoryUnlockPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET as string) as InventoryUnlockPayload;
  } catch {
    throw new Error("Invalid or expired inventory unlock");
  }
  if (payload.type !== "inventory-unlock" || payload.sub !== expectedUserId) {
    throw new Error("Invalid inventory unlock");
  }
}
