import type { Request, Response } from "express";
import { prisma } from "../utils/prisma";

// Customers only ever see active accounts — staff can also request the
// inactive ones (e.g. to reactivate an old account) via ?active=true.
export async function list(req: Request, res: Response) {
  const activeOnly = req.user?.type === "customer" || req.query.active === "true";
  const accounts = await prisma.bankAccount.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: { createdAt: "desc" },
  });
  res.json(accounts);
}

export async function create(req: Request, res: Response) {
  const account = await prisma.bankAccount.create({ data: req.body });
  res.status(201).json(account);
}

export async function update(req: Request, res: Response) {
  const account = await prisma.bankAccount.update({ where: { id: req.params.id }, data: req.body });
  res.json(account);
}

export async function remove(req: Request, res: Response) {
  await prisma.bankAccount.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
