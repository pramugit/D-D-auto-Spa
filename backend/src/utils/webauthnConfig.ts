// Derives WebAuthn's rpID (a bare hostname, no scheme/port) and the
// expected origin from CORS_ORIGIN, so no extra required env var exists
// for the common case — override with WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN
// only if the frontend's public origin can't be inferred this way (e.g.
// behind a reverse proxy with a different public hostname than what
// CORS_ORIGIN is set to).
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5180";

export const RP_NAME = "D & D Auto Spa";
export const RP_ID = process.env.WEBAUTHN_RP_ID ?? new URL(corsOrigin).hostname;
export const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? corsOrigin;
