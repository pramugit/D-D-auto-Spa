import jwt, { type SignOptions } from "jsonwebtoken";
import type { StaffRole } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

export interface StaffTokenPayload {
  type: "staff";
  sub: string;
  role: StaffRole;
}

export interface CustomerTokenPayload {
  type: "customer";
  sub: string;
}

export type TokenPayload = StaffTokenPayload | CustomerTokenPayload;

export function signToken(payload: TokenPayload): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET as string) as TokenPayload;
}
