import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/AppError";
import { RP_NAME, RP_ID, ORIGIN } from "../utils/webauthnConfig";

// A registration/authentication ceremony takes seconds to a couple of
// minutes; this codebase has no shared session store (see
// jobNotificationService.ts's note on lazy/on-demand computation — no
// cron, no Redis), so an in-memory map keyed by userId is enough for a
// single backend instance. Worst case on a restart mid-ceremony: the
// user's browser prompt fails and they just try again.
const challenges = new Map<string, { challenge: string; expiresAt: number }>();
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

function storeChallenge(userId: string, challenge: string) {
  challenges.set(userId, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function takeChallenge(userId: string): string {
  const entry = challenges.get(userId);
  challenges.delete(userId);
  if (!entry || entry.expiresAt < Date.now()) {
    throw new AppError(400, "This request expired — please try again");
  }
  return entry.challenge;
}

export async function getRegistrationOptions(userId: string, userName: string, userDisplayName: string) {
  const existing = await prisma.webAuthnCredential.findMany({ where: { userId } });
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(userId),
    userName,
    userDisplayName,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credentialId })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
      // Not locked to "platform" (built-in fingerprint/Face ID only) — a
      // cross-platform security key is a legitimate unlock factor too,
      // and restricting it wouldn't add real security for this use case.
    },
  });
  storeChallenge(userId, options.challenge);
  return options;
}

export async function verifyRegistration(userId: string, deviceName: string, response: RegistrationResponseJSON) {
  const expectedChallenge = takeChallenge(userId);
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new AppError(400, "Could not verify this device");
  }
  const { credential } = verification.registrationInfo;
  await prisma.webAuthnCredential.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      deviceName,
    },
  });
}

export async function listCredentials(userId: string) {
  return prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function removeCredential(userId: string, credentialRowId: string) {
  const cred = await prisma.webAuthnCredential.findUnique({ where: { id: credentialRowId } });
  if (!cred || cred.userId !== userId) throw new AppError(404, "Device not found");
  await prisma.webAuthnCredential.delete({ where: { id: credentialRowId } });
}

export async function getUnlockOptions(userId: string) {
  const existing = await prisma.webAuthnCredential.findMany({ where: { userId } });
  if (existing.length === 0) {
    throw new AppError(400, "No device registered yet — register one, or unlock with your password instead.");
  }
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "required",
    allowCredentials: existing.map((c) => ({ id: c.credentialId })),
  });
  storeChallenge(userId, options.challenge);
  return options;
}

export async function verifyUnlock(userId: string, response: AuthenticationResponseJSON) {
  const expectedChallenge = takeChallenge(userId);
  const cred = await prisma.webAuthnCredential.findUnique({ where: { credentialId: response.id } });
  if (!cred || cred.userId !== userId) {
    throw new AppError(400, "Unrecognized device");
  }
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: cred.credentialId,
      publicKey: new Uint8Array(cred.publicKey),
      counter: Number(cred.counter),
    },
  });
  if (!verification.verified) {
    throw new AppError(400, "Could not verify this device");
  }
  await prisma.webAuthnCredential.update({
    where: { id: cred.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });
}
