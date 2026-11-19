import type { Request, Response } from "express";
import { changeCustomerPassword, loginCustomer, registerCustomer } from "../services/customerAuthService";

export async function register(req: Request, res: Response) {
  const result = await registerCustomer(req.body);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const result = await loginCustomer(email, password);
  res.json(result);
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body;
  await changeCustomerPassword(req.user!.sub, currentPassword, newPassword);
  res.status(204).send();
}
