import type { Request, Response } from "express";
import { loginStaff, registerStaff } from "../services/authService";

export async function register(req: Request, res: Response) {
  const user = await registerStaff(req.body);
  res.status(201).json({ user });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const result = await loginStaff(email, password);
  res.json(result);
}

export async function me(req: Request, res: Response) {
  res.json({ user: req.user });
}
