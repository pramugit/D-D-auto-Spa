import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma";
import { signToken } from "../utils/jwt";
import { AppError } from "../utils/AppError";

export async function registerCustomer(input: {
  name: string;
  phone: string;
  email: string;
  password: string;
  address?: string;
}) {
  const existing = await prisma.customer.findUnique({ where: { email: input.email } });

  const passwordHash = await bcrypt.hash(input.password, 10);

  let customer;
  if (existing) {
    // A staff member may have already created this customer's record
    // (e.g. from a walk-in visit) without a login. Let a matching email
    // "claim" that existing record instead of fragmenting their history
    // across two customer rows.
    if (existing.passwordHash) {
      throw new AppError(409, "An account with this email already exists");
    }
    customer = await prisma.customer.update({
      where: { id: existing.id },
      data: { passwordHash, name: input.name, phone: input.phone, address: input.address ?? existing.address },
    });
  } else {
    customer = await prisma.customer.create({
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email,
        address: input.address,
        passwordHash,
      },
    });
  }

  const token = signToken({ type: "customer", sub: customer.id });
  return {
    token,
    customer: { id: customer.id, name: customer.name, email: customer.email, loyaltyPoints: customer.loyaltyPoints },
  };
}

export async function changeCustomerPassword(customerId: string, currentPassword: string, newPassword: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || !customer.passwordHash) {
    throw new AppError(400, "No password set for this account");
  }
  const valid = await bcrypt.compare(currentPassword, customer.passwordHash);
  if (!valid) {
    throw new AppError(401, "Current password is incorrect");
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.customer.update({ where: { id: customerId }, data: { passwordHash } });
}

export async function loginCustomer(email: string, password: string) {
  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer || !customer.passwordHash) {
    throw new AppError(401, "Invalid email or password");
  }
  const valid = await bcrypt.compare(password, customer.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }
  const token = signToken({ type: "customer", sub: customer.id });
  return {
    token,
    customer: { id: customer.id, name: customer.name, email: customer.email, loyaltyPoints: customer.loyaltyPoints },
  };
}
