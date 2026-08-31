import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma";
import { signToken } from "../utils/jwt";
import { AppError } from "../utils/AppError";
import type { StaffRole } from "@prisma/client";

export async function registerStaff(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role?: StaffRole;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, "A staff account with this email already exists");
  }

  const staffCount = await prisma.user.count();
  const isBootstrap = staffCount === 0;

  // The very first account bootstraps the system and must be an admin;
  // every account after that requires an authenticated admin caller
  // (enforced by the route middleware, not here).
  const role: StaffRole = isBootstrap ? "ADMIN" : input.role ?? "TECHNICIAN";

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role,
    },
  });

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function loginStaff(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(401, "Invalid email or password");
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }
  const token = signToken({ type: "staff", sub: user.id, role: user.role });
  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

export async function isBootstrapNeeded() {
  const count = await prisma.user.count();
  return count === 0;
}
